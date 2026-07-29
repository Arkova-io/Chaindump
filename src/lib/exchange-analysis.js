// Cohort-safe normalization for exchange case studies.
//
// A comparison group is only comparable when venue kind, operating-product
// cohort, metric type, unit, and measurement window all match. The helpers in
// this module intentionally never sum or average metric values.

function parse(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function countBy(items, keyFor) {
  const counts = {};
  for (const item of items) {
    const key = keyFor(item) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function sortedCounts(counts) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
}

export function normalizeExchangeCase(row) {
  const profile = parse(row.profile, {});
  const chains = parse(row.feature_chains, profile.chains || []);
  const evidence = parse(row.feature_evidence, {});
  const sourceReplacements = evidence.source_replacements && typeof evidence.source_replacements === 'object'
    ? evidence.source_replacements : {};
  const rawSources = parse(row.sources, []);
  const sources = (Array.isArray(rawSources) ? rawSources : []).map((source) => {
    const url = typeof source === 'string' ? source : source?.url;
    const replacement = sourceReplacements[url];
    if (!replacement) return source;
    return typeof source === 'string' ? replacement : { ...source, url: replacement };
  });
  const qualityIssues = parse(row.feature_quality_issues, ['normalized_feature_record_missing']);
  const metricType = row.feature_metric_type || row.metric_type || 'unknown';
  const metricUnit = String(row.feature_metric_unit || row.metric_unit || 'unknown').toLowerCase();
  const metricWindow = row.feature_metric_window || 'unknown';
  const productCohort = row.feature_product_cohort || 'unclassified';
  const comparisonKey = row.feature_comparability_key
    || `${row.kind}|${productCohort}|${metricType}|${metricUnit}|${metricWindow}`;
  const primaryChain = row.feature_primary_chain || row.primary_chain || chains[0] || null;

  return {
    slug: row.slug,
    kind: row.kind,
    lifecycle: row.lifecycle,
    venue_type: row.venue_type || 'exchange',
    name: row.name,
    launched: row.launched || null,
    primary_chain: primaryChain,
    status: row.status || row.lifecycle,
    metric_label: row.metric_label,
    metric_type: metricType,
    metric_unit: metricUnit,
    metric: row.metric == null ? null : row.metric,
    peak_metric: row.peak_metric == null ? null : row.peak_metric,
    drawdown_pct: row.drawdown_pct == null ? null : row.drawdown_pct,
    event_date: row.event_date || null,
    summary: row.summary || null,
    outlook: row.outlook || null,
    profile,
    sources: Array.isArray(sources) ? sources : [],
    updated_at: row.updated_at || null,
    analysis: {
      operating_model: row.feature_operating_model || null,
      product_cohort: productCohort,
      custody_model: row.feature_custody_model || null,
      primary_chain: primaryChain,
      chains: Array.isArray(chains) ? chains : [],
      token: {
        status: row.feature_token_status || 'not_identified',
        symbol: row.feature_token_symbol || null,
        launch_date: row.feature_token_launch_date || null,
        launch_timing: row.feature_token_launch_timing || 'unknown',
        strategy: row.feature_token_strategy || 'unresolved',
        source_url: row.feature_token_source_url || null,
      },
      metric: {
        type: metricType,
        unit: metricUnit,
        window: metricWindow,
        as_of: row.feature_metric_as_of || null,
        comparability_key: comparisonKey,
      },
      evidence,
      data_quality: {
        label: row.feature_quality_label || 'limited',
        issues: Array.isArray(qualityIssues) ? qualityIssues : ['invalid_quality_issues'],
      },
    },
  };
}

export function summarizeExchangeCases(cases, kind) {
  const scoped = cases.filter((row) => row.kind === kind);
  const comparison = new Map();
  const products = new Map();
  const chains = new Map();
  const tokenStrategies = new Map();

  for (const row of scoped) {
    const analysis = row.analysis || {};
    const metric = analysis.metric || {};
    const productCohort = analysis.product_cohort || 'unclassified';
    const comparisonKey = metric.comparability_key
      || `${kind}|${productCohort}|${row.metric_type || 'unknown'}|${row.metric_unit || 'unknown'}|${metric.window || 'unknown'}`;

    const comparisonGroup = comparison.get(comparisonKey) || {
      comparabilityKey: comparisonKey,
      productCohort,
      metricType: metric.type || row.metric_type || 'unknown',
      metricUnit: metric.unit || row.metric_unit || 'unknown',
      metricWindow: metric.window || 'unknown',
      count: 0,
      lifecycleCounts: {},
      cases: [],
    };
    comparisonGroup.count++;
    comparisonGroup.lifecycleCounts[row.lifecycle] = (comparisonGroup.lifecycleCounts[row.lifecycle] || 0) + 1;
    comparisonGroup.cases.push(row.slug);
    comparison.set(comparisonKey, comparisonGroup);

    const product = products.get(productCohort) || {
      productCohort,
      count: 0,
      lifecycleCounts: {},
    };
    product.count++;
    product.lifecycleCounts[row.lifecycle] = (product.lifecycleCounts[row.lifecycle] || 0) + 1;
    products.set(productCohort, product);

    if (row.primary_chain) {
      const chain = chains.get(row.primary_chain) || {
        primaryChain: row.primary_chain,
        count: 0,
        lifecycleCounts: {},
      };
      chain.count++;
      chain.lifecycleCounts[row.lifecycle] = (chain.lifecycleCounts[row.lifecycle] || 0) + 1;
      chains.set(row.primary_chain, chain);
    }

    const tokenStrategy = analysis.token?.strategy || 'unresolved';
    const strategy = tokenStrategies.get(tokenStrategy) || {
      tokenStrategy,
      count: 0,
      lifecycleCounts: {},
    };
    strategy.count++;
    strategy.lifecycleCounts[row.lifecycle] = (strategy.lifecycleCounts[row.lifecycle] || 0) + 1;
    tokenStrategies.set(tokenStrategy, strategy);
  }

  const tokenByLifecycle = {};
  for (const lifecycle of ['successful', 'mid', 'dead']) {
    const lifecycleCases = scoped.filter((row) => row.lifecycle === lifecycle);
    tokenByLifecycle[lifecycle] = {
      total: lifecycleCases.length,
      launched: lifecycleCases.filter((row) => row.analysis?.token?.status === 'launched').length,
      notIdentified: lifecycleCases.filter((row) => row.analysis?.token?.status !== 'launched').length,
    };
  }

  return {
    kind,
    count: scoped.length,
    lifecycleCounts: countBy(scoped, (row) => row.lifecycle),
    qualityCounts: countBy(scoped, (row) => row.analysis?.data_quality?.label),
    tokenByLifecycle,
    productCohorts: [...products.values()]
      .sort((a, b) => b.count - a.count || a.productCohort.localeCompare(b.productCohort)),
    primaryChainContexts: [...chains.values()]
      .sort((a, b) => b.count - a.count || a.primaryChain.localeCompare(b.primaryChain)),
    tokenStrategies: [...tokenStrategies.values()]
      .sort((a, b) => b.count - a.count || a.tokenStrategy.localeCompare(b.tokenStrategy)),
    comparisonGroups: [...comparison.values()]
      .map((group) => ({ ...group, cases: [...group.cases].sort() }))
      .sort((a, b) => b.count - a.count || a.comparabilityKey.localeCompare(b.comparabilityKey)),
    cautions: [
      'Metric values are not pooled across comparison groups.',
      'Aggregator-routed volume overlaps underlying venue volume and is not additive.',
      'Token counts are descriptive; they do not establish that token launch caused an outcome.',
      'Primary-chain counts are deployment context, not evidence that a chain caused an outcome.',
      'DEX and CEX cases are summarized in separate populations.',
    ],
    qualityLabels: sortedCounts(countBy(scoped, (row) => row.analysis?.data_quality?.label)),
  };
}

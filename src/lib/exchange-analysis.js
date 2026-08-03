// Cohort-safe normalization for exchange case studies.
//
// A comparison group is only comparable when venue kind, operating-product
// cohort, metric type, unit, and measurement window all match. The helpers in
// this module intentionally never sum or average metric values.

import { normalizeForensicAnalysis } from './forensic-analysis.js';

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

function rounded(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

// Wilson score intervals remain bounded at 0..1 and behave materially better
// than normal approximations for the small forensic cohorts in this corpus.
function outcomeEstimate(items, populationRate) {
  const sampleSize = items.length;
  const successful = items.filter((item) => item.lifecycle === 'successful').length;
  const mid = items.filter((item) => item.lifecycle === 'mid').length;
  const dead = items.filter((item) => item.lifecycle === 'dead').length;
  const successRate = sampleSize ? successful / sampleSize : 0;
  if (!sampleSize) {
    return {
      sampleSize: 0,
      successful: 0,
      mid: 0,
      dead: 0,
      successRate: 0,
      ci95: { low: 0, high: 1 },
      riskDifferenceVsPopulation: populationRate == null ? 0 : rounded(-populationRate),
      smallSample: true,
    };
  }
  const z = 1.96;
  const denominator = 1 + (z ** 2 / sampleSize);
  const centre = (successRate + (z ** 2 / (2 * sampleSize))) / denominator;
  const margin = (z / denominator) * Math.sqrt(
    (successRate * (1 - successRate) / sampleSize)
    + (z ** 2 / (4 * sampleSize ** 2)),
  );
  return {
    sampleSize,
    successful,
    mid,
    dead,
    successRate: rounded(successRate),
    ci95: {
      low: rounded(Math.max(0, centre - margin)),
      high: rounded(Math.min(1, centre + margin)),
    },
    riskDifferenceVsPopulation: populationRate == null
      ? 0
      : rounded(successRate - populationRate),
    smallSample: sampleSize < 5,
  };
}

function associationGroups(items, keyFor, populationRate) {
  const groups = new Map();
  for (const item of items) {
    const key = String(keyFor(item) || 'unknown');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()]
    .map(([key, rows]) => ({ key, ...outcomeEstimate(rows, populationRate) }))
    .sort((a, b) => b.sampleSize - a.sampleSize || a.key.localeCompare(b.key));
}

function isCurrentEvidence(row, asOfDate) {
  const freshness = row.analysis?.freshness || {};
  return row.analysis?.data_quality?.label !== 'limited'
    && freshness.status === 'current'
    && Boolean(freshness.last_verified_at)
    && freshness.last_verified_at <= asOfDate
    && Boolean(freshness.next_review_at)
    && freshness.next_review_at >= asOfDate;
}

function buildOutcomeAssociations(scoped) {
  const overall = outcomeEstimate(scoped, null);
  const populationRate = overall.successRate;
  const tokenGroup = (row) => {
    if (row.analysis?.token?.status !== 'launched') return 'not_identified';
    return row.analysis.token.evidence_level === 'documented'
      ? 'documented_launched'
      : 'launched_unverified';
  };
  return {
    overall,
    tokenLaunch: associationGroups(scoped, tokenGroup, populationRate),
    productCohort: associationGroups(
      scoped,
      (row) => row.analysis?.product_cohort || 'unclassified',
      populationRate,
    ),
    primaryChain: associationGroups(
      scoped,
      (row) => row.primary_chain || 'unknown',
      populationRate,
    ),
    method: 'Descriptive association only. Success is the published successful lifecycle; mid and dead are non-success outcomes. Rates use 95% Wilson score intervals. Risk differences compare each observed group with this kind-wide population and are not adjusted causal effects.',
  };
}

function buildTrendReadiness(scoped, comparison, asOfDate) {
  return {
    totalCases: scoped.length,
    causalDossiers: scoped.filter((row) => (
      row.analysis?.forensic_analysis_status === 'published'
      || row.analysis?.canonical_evidence?.explanation_complete === true
    )).length,
    documentedTokenCases: scoped.filter((row) => row.analysis?.token?.evidence_level === 'documented').length,
    currentEvidenceCases: scoped.filter((row) => isCurrentEvidence(row, asOfDate)).length,
    comparableMetricGroups: [...comparison.values()].filter((group) => group.count >= 2).length,
  };
}

function buildHypotheses() {
  return [
    {
      variable: 'token_launch',
      hypothesis: 'Documented token launch may correlate with liquidity bootstrapping or governance coordination, while poorly matched emissions can correlate with later decline.',
      causalClaim: false,
      falsifier: 'Within comparable product cohorts and launch eras, the rate difference disappears or reverses after separating token timing, incentive design, and evidence quality.',
    },
    {
      variable: 'primary_chain',
      hypothesis: 'Host-chain distribution, fees, wallet reach, and liquidity can shape venue adoption, but chain labels also proxy launch era and product type.',
      causalClaim: false,
      falsifier: 'Matched venues on the same product model show no persistent chain-context difference after controlling for launch cohort and token incentives.',
    },
    {
      variable: 'product_cohort',
      hypothesis: 'Focused product design and distribution may be more predictive than a generic DEX/CEX label.',
      causalClaim: false,
      falsifier: 'Cohort-level rate differences do not survive larger samples, explicit selection dates, and consistent lifecycle follow-up windows.',
    },
  ];
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
  const sourceById = Object.fromEntries(sources.flatMap((source) => (
    source && typeof source !== 'string' && source.id && source.url ? [[source.id, source]] : []
  )));
  const forensicResult = profile.forensic_analysis
    ? normalizeForensicAnalysis(profile.forensic_analysis, {
      resolveRef: (reference) => sourceById[reference] || sources.find((source) => (
        (typeof source === 'string' ? source : source?.url) === reference
      )),
    })
    : null;
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
        evidence_level: row.feature_token_source_url ? 'documented' : 'unverified',
      },
      metric: {
        type: metricType,
        unit: metricUnit,
        window: metricWindow,
        as_of: row.feature_metric_as_of || null,
        observed_at: row.feature_metric_observed_at || null,
        comparability_key: comparisonKey,
      },
      evidence,
      forensic_analysis: forensicResult && forensicResult.errors.length === 0
        ? forensicResult.value : null,
      forensic_analysis_status: forensicResult
        ? (forensicResult.errors.length ? 'pending_review' : 'published')
        : 'pending',
      data_quality: {
        label: row.feature_quality_label || 'limited',
        issues: Array.isArray(qualityIssues) ? qualityIssues : ['invalid_quality_issues'],
      },
      freshness: {
        lifecycle_evidence_date: row.feature_lifecycle_evidence_date || null,
        last_verified_at: row.feature_last_verified_at || null,
        next_review_at: row.feature_next_review_at || null,
        status: row.feature_freshness_status || 'unknown',
      },
    },
  };
}

export function summarizeExchangeCases(
  cases,
  kind,
  asOfDate = new Date().toISOString().slice(0, 10),
) {
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
      documentedLaunched: lifecycleCases.filter((row) => (
        row.analysis?.token?.status === 'launched'
        && row.analysis?.token?.evidence_level === 'documented'
      )).length,
      unverifiedLaunched: lifecycleCases.filter((row) => (
        row.analysis?.token?.status === 'launched'
        && row.analysis?.token?.evidence_level !== 'documented'
      )).length,
      notIdentified: lifecycleCases.filter((row) => row.analysis?.token?.status !== 'launched').length,
    };
  }

  const outcomeAssociations = buildOutcomeAssociations(scoped);
  const trendReadiness = buildTrendReadiness(scoped, comparison, asOfDate);
  const hypotheses = buildHypotheses();

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
      .map((group) => ({ ...group, cases: [...group.cases].sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => b.count - a.count || a.comparabilityKey.localeCompare(b.comparabilityKey)),
    outcomeAssociations,
    trendReadiness,
    hypotheses,
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

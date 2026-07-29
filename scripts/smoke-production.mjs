import { pathToFileURL } from 'node:url';

const REQUIRED_NAV = [
  'Blockchain Analysis',
  'DEX/CEX Analysis',
  'Web3 Casino Analysis',
  'NFT and Ordinals Analysis',
];
const REQUEST_TIMEOUT_MS = 20000;

async function jsonAt(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${new URL(url).pathname} returned ${response.status}`);
  return response.json();
}

function normalizeBaseUrl(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('baseUrl is required');
  return base;
}

function assertHealth(health, expectedRevision) {
  if (health.ok !== true) throw new Error('/api/health did not report ok');
  if (health.revision !== expectedRevision) {
    throw new Error(`/api/health revision mismatch: expected ${expectedRevision}, got ${health.revision || 'none'}`);
  }
}

async function loadLegacyCohorts(fetchImpl, base) {
  const cohorts = {};
  const routes = [
    ['successful', '/api/successful-exchanges'],
    ['mid', '/api/mid-exchanges'],
    ['dead', '/api/dead-exchanges'],
  ];
  for (const [lifecycle, route] of routes) {
    for (const kind of ['dex', 'cex']) {
      const path = `${route}?kind=${kind}`;
      const payload = await jsonAt(fetchImpl, base + path);
      if (!Array.isArray(payload.exchanges)) throw new TypeError(`${path} omitted exchanges[]`);
      cohorts[`${lifecycle}${kind[0].toUpperCase()}${kind.slice(1)}`] = payload.exchanges.length;
    }
  }
  if (cohorts.successfulDex < 1) {
    throw new Error('/api/successful-exchanges?kind=dex returned no seeded dossiers');
  }
  return cohorts;
}

async function loadNormalizedCounts(fetchImpl, base) {
  const normalized = {};
  for (const kind of ['dex', 'cex']) {
    const path = `/api/exchange-analysis?kind=${kind}`;
    const payload = await jsonAt(fetchImpl, base + path);
    if (!Array.isArray(payload.cases)) throw new TypeError(`${path} omitted cases[]`);
    if (!Array.isArray(payload.summary?.comparisonGroups)) {
      throw new TypeError(`${path} omitted cohort-safe comparisonGroups[]`);
    }
    if (Object.hasOwn(payload.summary, 'totalMetric')) {
      throw new Error(`${path} exposed an incomparable pooled metric`);
    }
    normalized[kind] = payload.cases.length;
  }
  if (normalized.dex < 29) throw new Error(`/api/exchange-analysis?kind=dex returned ${normalized.dex} cases; expected at least 29`);
  if (normalized.cex < 18) throw new Error(`/api/exchange-analysis?kind=cex returned ${normalized.cex} cases; expected at least 18`);
  return normalized;
}

async function assertAnalysisUi(fetchImpl, base) {
  const response = await fetchImpl(`${base}/exchange-analysis`, {
    headers: { accept: 'text/html', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`/exchange-analysis returned ${response.status}`);
  const html = await response.text();
  const missingNav = REQUIRED_NAV.filter((label) => !html.includes(label));
  if (missingNav.length) throw new Error(`/exchange-analysis missing nav: ${missingNav.join(', ')}`);
}

export async function checkProduction({
  baseUrl,
  expectedRevision,
  fetchImpl = fetch,
}) {
  const base = normalizeBaseUrl(baseUrl);
  if (!expectedRevision) throw new Error('expectedRevision is required');

  const health = await jsonAt(fetchImpl, `${base}/api/health`);
  assertHealth(health, expectedRevision);

  const chains = await jsonAt(fetchImpl, `${base}/api/chains`);
  if (!Number.isInteger(chains.count) || chains.count < 50) {
    throw new Error(`/api/chains returned ${chains.count ?? 'no'} rows; expected at least 50`);
  }

  const cohorts = await loadLegacyCohorts(fetchImpl, base);
  const normalized = await loadNormalizedCounts(fetchImpl, base);
  await assertAnalysisUi(fetchImpl, base);

  return {
    revision: health.revision,
    chains: chains.count,
    normalizedDex: normalized.dex,
    normalizedCex: normalized.cex,
    ...cohorts,
  };
}

async function run() {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((pairs, value, index, all) => {
      if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]);
      return pairs;
    }, []),
  );
  const attempts = Number(args.attempts || 5);
  const delayMs = Number(args.delay || 10000);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await checkProduction({
        baseUrl: args.base,
        expectedRevision: args.revision,
      });
      console.log(`Production smoke passed on attempt ${attempt}.`);
      return;
    } catch {
      lastError = new Error('Production surface did not become ready');
      console.error(`Production smoke attempt ${attempt}/${attempts} failed.`);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await run();
  } catch {
    console.error('Production smoke failed after all attempts.');
    process.exitCode = 1;
  }
}

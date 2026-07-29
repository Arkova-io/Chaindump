// Validation for research-desk chain_facts seed rows.
//
// D1 stores each dimension as JSON text, so malformed or structurally incomplete
// research otherwise remains invisible until a profile is opened in production.
// Keep this validator dependency-free so migrations and tests can run it directly.

export const CHAIN_DOSSIER_DIMENSIONS = Object.freeze([
  'identity',
  'token',
  'capital',
  'onchain',
  'team',
  'narrative',
  'risk',
  'synthesis',
]);

export const CHAIN_DOSSIER_STATUSES = Object.freeze([
  'anticipated',
  'emerging',
  'established',
  'recovering',
  'quietly_building',
  'pivoting',
  'stagnating',
  'declining',
  'zombie',
  'dead',
]);

const CATEGORIES = new Set(['L1', 'L2_rollup', 'L2_validium', 'sidechain', 'appchain', 'other']);
const VMS = new Set(['EVM', 'SVM', 'MoveVM', 'CosmWasm', 'Cairo', 'WASM', 'other']);
const TOKEN_LAUNCH = new Set(['launched', 'not_launched']);
const BACKER_TIERS = new Set(['tier1', 'tier2', 'mixed', 'corporate', 'none_unknown']);
const HTTP_URL = /^https:\/\/[^\s]+$/;
const DATE_PRECISION = Object.freeze({
  day: /^\d{4}-\d{2}-\d{2}$/,
  month: /^\d{4}-\d{2}$/,
  year: /^\d{4}$/,
});

function parse(value, label, errors) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    errors.push(`${label}: invalid JSON`);
    return null;
  }
}

function walkUrls(value, path, errors) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if ((key === 'source_url' || key.endsWith('_url')) && child != null && !HTTP_URL.test(child)) {
      errors.push(`${childPath}: expected an https URL`);
    }
    if (child && typeof child === 'object') walkUrls(child, childPath, errors);
  }
}

function requireSourceUrls(items, path, errors) {
  for (const [index, item] of (items || []).entries()) {
    if (!HTTP_URL.test(item?.source_url || '')) {
      errors.push(`${path}[${index}].source_url: required https URL`);
    }
  }
}

export function validateChainDossierRows(rows, expectedChains) {
  const errors = [];
  const expected = new Set(expectedChains);
  const byChain = new Map();

  for (const row of rows) {
    if (!expected.has(row.chain)) errors.push(`${row.chain}: unexpected chain`);
    if (!byChain.has(row.chain)) byChain.set(row.chain, new Map());
    const dimensions = byChain.get(row.chain);
    if (dimensions.has(row.dimension)) errors.push(`${row.chain}.${row.dimension}: duplicate row`);

    const data = parse(row.data, `${row.chain}.${row.dimension}.data`, errors);
    const sources = parse(row.sources, `${row.chain}.${row.dimension}.sources`, errors);
    dimensions.set(row.dimension, { data, sources });

    if (row.dimension !== '_meta') {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        errors.push(`${row.chain}.${row.dimension}: data must be an object`);
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.as_of || '')) {
        errors.push(`${row.chain}.${row.dimension}.as_of: required YYYY-MM-DD provenance date`);
      }
      if (!Array.isArray(sources) || sources.length === 0) {
        errors.push(`${row.chain}.${row.dimension}: at least one source is required`);
      } else {
        for (const [index, source] of sources.entries()) {
          if (!source?.title || !HTTP_URL.test(source?.url || '')) {
            errors.push(`${row.chain}.${row.dimension}.sources[${index}]: title and https URL required`);
          }
        }
      }
      walkUrls(data, `${row.chain}.${row.dimension}`, errors);
    }
  }

  for (const chain of expected) {
    const dimensions = byChain.get(chain);
    if (!dimensions) {
      errors.push(`${chain}: no rows`);
      continue;
    }
    for (const dimension of CHAIN_DOSSIER_DIMENSIONS) {
      if (!dimensions.has(dimension)) errors.push(`${chain}.${dimension}: missing row`);
    }
    const extras = [...dimensions.keys()].filter((d) => d !== '_meta' && !CHAIN_DOSSIER_DIMENSIONS.includes(d));
    if (extras.length) errors.push(`${chain}: unexpected dimensions ${extras.join(', ')}`);

    const identity = dimensions.get('identity')?.data;
    if (identity) {
      if (identity.chain !== chain) errors.push(`${chain}.identity.chain: canonical name mismatch`);
      if (!CATEGORIES.has(identity.category)) errors.push(`${chain}.identity.category: invalid value`);
      if (!VMS.has(identity.vm)) errors.push(`${chain}.identity.vm: invalid value`);
      if (!CHAIN_DOSSIER_STATUSES.includes(identity.status)) errors.push(`${chain}.identity.status: invalid value`);
      const launchPrecision = identity.launch_date_precision || 'day';
      if (!DATE_PRECISION[launchPrecision]?.test(identity.launched || '')) {
        errors.push(`${chain}.identity.launched: date must match declared precision`);
      }
      if (!Array.isArray(identity.lifecycle) || identity.lifecycle.length === 0) {
        errors.push(`${chain}.identity.lifecycle: at least one event required`);
      }
      requireSourceUrls(identity.lifecycle, `${chain}.identity.lifecycle`, errors);
    }

    const token = dimensions.get('token')?.data;
    if (token) {
      if (!TOKEN_LAUNCH.has(token.launch_status)) errors.push(`${chain}.token.launch_status: invalid value`);
      if (!token.gas_token) errors.push(`${chain}.token.gas_token: required`);
      if (token.launch_status === 'launched' && (!token.token_symbol || !token.launch_date)) {
        errors.push(`${chain}.token: launched tokens require symbol and launch_date`);
      }
      if (token.launch_status === 'launched') {
        const tokenPrecision = token.launch_date_precision || 'day';
        if (!DATE_PRECISION[tokenPrecision]?.test(token.launch_date || '')) {
          errors.push(`${chain}.token.launch_date: date must match declared precision`);
        }
      }
      if (token.launch_status === 'not_launched' && token.token_symbol != null) {
        errors.push(`${chain}.token: token_symbol must be null when no network token launched`);
      }
      if (!HTTP_URL.test(token.source_url || '')) {
        errors.push(`${chain}.token.source_url: required https URL`);
      }
    }

    const capital = dimensions.get('capital')?.data;
    if (capital) {
      if (!Array.isArray(capital.rounds)) errors.push(`${chain}.capital.rounds: array required`);
      if (!BACKER_TIERS.has(capital.backers_tier)) errors.push(`${chain}.capital.backers_tier: invalid value`);
      requireSourceUrls(capital.rounds, `${chain}.capital.rounds`, errors);
    }

    const onchain = dimensions.get('onchain')?.data;
    if (onchain) {
      if (!HTTP_URL.test(onchain.source_url || '')) {
        errors.push(`${chain}.onchain.source_url: TVL provenance required`);
      }
      if ((onchain.fees_24h_usd != null || onchain.fees_30d_usd != null || onchain.revenue_30d_usd != null)
          && !HTTP_URL.test(onchain.fees_source_url || '')) {
        errors.push(`${chain}.onchain.fees_source_url: fee provenance required`);
      }
      if (onchain.revenue_30d_usd != null && !HTTP_URL.test(onchain.revenue_source_url || '')) {
        errors.push(`${chain}.onchain.revenue_source_url: revenue provenance required`);
      }
      if (onchain.spot_dex_volume_24h_usd != null && !HTTP_URL.test(onchain.volume_source_url || '')) {
        errors.push(`${chain}.onchain.volume_source_url: volume provenance required`);
      }
      if (onchain.stablecoin_tvl_usd != null && !HTTP_URL.test(onchain.stablecoin_source_url || '')) {
        errors.push(`${chain}.onchain.stablecoin_source_url: stablecoin provenance required`);
      }
    }

    const team = dimensions.get('team')?.data;
    if (team) {
      if (!Array.isArray(team.founders) || !Array.isArray(team.key_events)) {
        errors.push(`${chain}.team: founders and key_events arrays required`);
      }
      requireSourceUrls(team.founders, `${chain}.team.founders`, errors);
      requireSourceUrls(team.key_events, `${chain}.team.key_events`, errors);
    }

    const risk = dimensions.get('risk')?.data;
    if (risk) {
      if (!Array.isArray(risk.exploits) || !Array.isArray(risk.risks)) {
        errors.push(`${chain}.risk: exploits and risks arrays required`);
      }
      if (typeof risk.sanctions?.flagged !== 'boolean') {
        errors.push(`${chain}.risk.sanctions.flagged: boolean required`);
      }
      requireSourceUrls(risk.exploits, `${chain}.risk.exploits`, errors);
    }

    const meta = dimensions.get('_meta')?.data;
    if (!meta) {
      errors.push(`${chain}._meta: required`);
    } else {
      if (meta.dimension_completeness_pct !== 100) {
        errors.push(`${chain}._meta.dimension_completeness_pct: expected 100`);
      }
      if (!(meta.data_completeness_pct > 0 && meta.data_completeness_pct < 100)) {
        errors.push(`${chain}._meta.data_completeness_pct: must honestly remain below 100`);
      }
      if (!Array.isArray(meta.unsourced_fields) || meta.unsourced_fields.length === 0) {
        errors.push(`${chain}._meta.unsourced_fields: explicit gaps required`);
      }
    }
  }

  return errors;
}

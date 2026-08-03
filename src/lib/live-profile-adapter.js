import { buildLegacyEntityProfile } from './entity-profile.js';

// Live rankings can change before the editorial corpus catches up. These
// adapters keep every visible "Open report" link honest and useful without
// pretending a market observation is a researched lifecycle conclusion.

export function canonicalEntitySlug(value) {
  return String(value || '').trim().toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function iso(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function source(id, title, url, publisher, role, asOf) {
  return {
    id,
    title,
    url,
    publisher,
    tier: role === 'primary' ? 'A' : 'B',
    role,
    access_state: 'reachable',
    accessed_at: asOf,
    checked_at: asOf,
  };
}

function pendingClaim(id, fieldPath, sourceIds, locator, note) {
  return {
    id,
    field_path: fieldPath,
    source_ids: sourceIds,
    evidence_locator: locator,
    support_direction: 'supports',
    note,
    review: { state: 'pending', reviewer: null, reviewed_at: null },
  };
}

function metric({
  id, dimension, label, value, unit, currency = null, asOf, claimId,
  windowDefinition = 'point_in_time',
}) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return {
    id,
    dimension,
    label,
    value: number,
    unit,
    currency,
    window: { start: null, end: null, definition: windowDefinition },
    as_of: asOf,
    method: 'observed',
    scope: { product: null, chains: [] },
    formula: null,
    raw_input_ids: [],
    claim_ids: [claimId],
    quality_flags: ['live_observation_only'],
  };
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(number);
}

function readablePeg(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^pegged[A-Z]/.test(text)) return text.replace(/^pegged/, 'pegged to ');
  return text;
}

const LIVE_REVIEW_INTERVAL_MS = 6 * 60 * 60 * 1000;

function liveFreshness(observedAt, now = Date.now()) {
  const reviewedAt = iso(observedAt);
  if (!reviewedAt) return null;
  const nextReviewAt = new Date(Date.parse(reviewedAt) + LIVE_REVIEW_INTERVAL_MS).toISOString();
  const age = Number(now) - Date.parse(reviewedAt);
  return {
    state: Number.isFinite(age) && age > LIVE_REVIEW_INTERVAL_MS ? 'stale' : 'current',
    last_reviewed_at: reviewedAt,
    next_review_at: nextReviewAt,
    field_reviews: [],
  };
}

export function buildLiveStablecoinProfile(record, observedAt, now = Date.now()) {
  const asOf = iso(observedAt);
  // A symbol is not a unique identity key: live rankings can contain distinct
  // products whose symbols differ only by case (for example USDf and USDF).
  // The ranking adapter assigns profileSlug when it detects that collision.
  const slug = canonicalEntitySlug(record?.profileSlug || record?.symbol || record?.name);
  if (!asOf || !slug || !record?.name) return null;
  const sourceId = 'defillama-stablecoin-rankings';
  const identityClaim = `stablecoin:${slug}:live-identity`;
  const supplyClaim = `stablecoin:${slug}:live-circulating`;
  const priceClaim = `stablecoin:${slug}:live-price`;
  const peg = [record.pegMechanism, readablePeg(record.pegType)].filter(Boolean).join(', ');
  const chains = Array.isArray(record.chains) ? record.chains.filter(Boolean) : [];
  const where = chains.length ? ` It is reported on ${chains.join(', ')}.` : '';
  const circulating = money(record.circulating);
  const price = record.price != null && Number.isFinite(Number(record.price))
    ? `$${Number(record.price).toLocaleString('en-US', { maximumFractionDigits: 6 })}`
    : null;

  return buildLegacyEntityProfile({
    identity: {
      id: `stablecoin:${slug}`,
      type: 'stablecoin',
      slug,
      name: record.name,
      aliases: record.symbol ? [record.symbol] : [],
    },
    classification: {
      subtype: record.pegMechanism || null,
      tags: [],
      chains,
      jurisdictions: [],
    },
    sections: {
      what_it_is: `${record.name}${record.symbol ? ` (${record.symbol})` : ''} is listed by DefiLlama as ${peg || 'a stablecoin'}.${where} Chaindump has not yet published a full issuer, reserve, redemption, legal, or lifecycle review for this asset.`,
      what_happened: [
        circulating ? `At this observation, DefiLlama reported ${circulating} of value in circulation.` : null,
        price ? `The reported market price was ${price}.` : null,
        'These are live market observations, not proof of reserve quality, redeemability, solvency, or regulatory status.',
      ].filter(Boolean).join(' '),
    },
    section_dates: { what_it_is: asOf, what_happened: asOf },
    section_claim_ids: {
      what_it_is: [identityClaim],
      what_happened: [supplyClaim, ...(price ? [priceClaim] : [])],
    },
    metrics: [
      metric({
        id: `stablecoin:${slug}:circulating-supply`,
        dimension: 'circulating_supply',
        label: 'Circulating value',
        value: record.circulating,
        unit: 'usd',
        currency: 'USD',
        asOf,
        claimId: supplyClaim,
      }),
      metric({
        id: `stablecoin:${slug}:price`,
        dimension: 'price',
        label: 'Market price',
        value: record.price,
        unit: 'usd',
        currency: 'USD',
        asOf,
        claimId: priceClaim,
      }),
    ].filter(Boolean),
    sources: [source(
      sourceId,
      'DefiLlama stablecoin rankings API',
      'https://stablecoins.llama.fi/stablecoins?includePrices=true',
      'DefiLlama',
      'aggregator',
      asOf,
    )],
    claims: [
      pendingClaim(identityClaim, 'analysis.sections.what_it_is.body', [sourceId], 'peggedAssets[] identity, peg classification, and chains', 'Live metadata only; full product and issuer research remains open.'),
      pendingClaim(supplyClaim, 'metrics.circulating_supply', [sourceId], 'peggedAssets[].circulating', 'Point-in-time aggregate observation; not a reserve attestation.'),
      ...(price ? [pendingClaim(priceClaim, 'metrics.price', [sourceId], 'peggedAssets[].price', 'Point-in-time market observation; not proof of redeemability.')] : []),
    ],
    as_of: asOf,
    freshness: liveFreshness(asOf, now),
    confidence: 'unknown',
    extensions: {
      legacy_origin: 'defillama_live_stablecoin_fallback',
      live_observation_only: true,
      research_needed: ['issuer', 'reserves', 'redemption', 'legal posture', 'lifecycle', 'causal analysis'],
    },
  });
}

export function buildLiveBlockchainProfile(record, observedAt, now = Date.now()) {
  const asOf = iso(observedAt);
  const slug = canonicalEntitySlug(record?.key || record?.name);
  if (!asOf || !slug || !record?.name) return null;
  const sourceIds = {
    board: 'chaindump-live-board',
    chains: 'defillama-chain-tvl',
    dexs: 'defillama-chain-dex-volume',
    fees: 'defillama-chain-fees',
    stables: 'defillama-stablecoin-chains',
    addresses: 'growthepie-fundamentals',
  };
  const identityClaim = `blockchain:${slug}:live-board`;
  const metricSpecs = [
    ['tvl', 'TVL', record.tvl, 'usd', 'USD', sourceIds.chains, 'point_in_time'],
    ['dex_spot_volume', 'DEX spot volume (24h)', record.volume24h, 'usd', 'USD', sourceIds.dexs, 'rolling_24h'],
    ['fees', 'Fees (24h)', record.fees24h, 'usd', 'USD', sourceIds.fees, 'rolling_24h'],
    ['stablecoin_supply', 'Stablecoin supply', record.stables, 'usd', 'USD', sourceIds.stables, 'point_in_time'],
    ['active_addresses', 'Active addresses (24h)', record.activeAddresses, 'count', null, sourceIds.addresses, 'rolling_24h'],
  ];
  const metricRows = [];
  const metricClaims = [];
  for (const [dimension, label, value, unit, currency, sourceId, windowDefinition] of metricSpecs) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) continue;
    const claimId = `blockchain:${slug}:live-${dimension}`;
    metricRows.push(metric({
      id: `blockchain:${slug}:${dimension}`,
      dimension,
      label,
      value,
      unit,
      currency,
      asOf,
      claimId,
      windowDefinition,
    }));
    metricClaims.push(pendingClaim(
      claimId,
      `metrics.${dimension}`,
      [sourceId],
      `${record.name} point-in-time ${label}`,
      'Live market observation; it does not establish user quality, profitability, or a lifecycle outcome.',
    ));
  }
  const observations = [
    record.tvl != null && Number.isFinite(Number(record.tvl)) ? `${money(record.tvl)} TVL` : null,
    record.volume24h != null && Number.isFinite(Number(record.volume24h)) ? `${money(record.volume24h)} in 24-hour DEX volume` : null,
    record.fees24h != null && Number.isFinite(Number(record.fees24h)) ? `${money(record.fees24h)} in 24-hour fees` : null,
  ].filter(Boolean);
  const metricClaimIds = metricClaims.map((claim) => claim.id);
  const referencedSourceIds = new Set([
    sourceIds.board,
    ...metricClaims.flatMap((claim) => claim.source_ids),
  ]);
  const sourceRows = [
    source(sourceIds.board, 'Chaindump live chain rankings', 'https://chaindump.xyz/api/chains', 'Chaindump', 'primary', asOf),
    source(sourceIds.chains, 'DefiLlama chains API', 'https://api.llama.fi/v2/chains', 'DefiLlama', 'aggregator', asOf),
    source(sourceIds.dexs, 'DefiLlama DEX volume API', 'https://api.llama.fi/overview/dexs', 'DefiLlama', 'aggregator', asOf),
    source(sourceIds.fees, 'DefiLlama fees API', 'https://api.llama.fi/overview/fees', 'DefiLlama', 'aggregator', asOf),
    source(sourceIds.stables, 'DefiLlama stablecoin chains API', 'https://stablecoins.llama.fi/stablecoinchains', 'DefiLlama', 'aggregator', asOf),
    source(sourceIds.addresses, 'growthepie fundamentals API', 'https://api.growthepie.xyz/v1/fundamentals.json', 'growthepie', 'aggregator', asOf),
  ].filter((row) => referencedSourceIds.has(row.id));
  return buildLegacyEntityProfile({
    identity: {
      id: `blockchain:${slug}`,
      type: 'blockchain',
      slug,
      name: record.name,
      aliases: record.symbol ? [record.symbol] : [],
    },
    classification: {
      subtype: record.category || null,
      tags: [],
      chains: [],
      jurisdictions: [],
    },
    sections: {
      what_it_is: `${record.name} is currently included in Chaindump's live chain rankings. This profile contains current onchain activity, but a sourced history, operating-model review, and causal analysis have not yet been published.`,
      what_happened: observations.length
        ? `At this observation, the tracked data showed ${observations.join(', ')}. These values describe activity at one point in time; they do not establish durable demand or explain why the chain is succeeding or struggling.`
        : null,
    },
    section_dates: { what_it_is: asOf, what_happened: asOf },
    section_claim_ids: {
      what_it_is: [identityClaim],
      what_happened: metricClaimIds,
    },
    metrics: metricRows,
    sources: sourceRows,
    claims: [
      pendingClaim(identityClaim, 'analysis.sections.what_it_is.body', [sourceIds.board], 'live rankings entity row', 'Live-board membership only; historical and causal research remains open.'),
      ...metricClaims,
    ],
    as_of: asOf,
    freshness: liveFreshness(asOf, now),
    confidence: 'unknown',
    extensions: {
      legacy_origin: 'live_chain_fallback',
      live_observation_only: true,
      live_rank: Number.isFinite(Number(record.rank)) ? Number(record.rank) : null,
      research_needed: ['history', 'operating model', 'token value capture', 'strategic choices', 'causal analysis', 'lifecycle'],
    },
  });
}

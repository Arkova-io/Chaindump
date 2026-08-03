const TYPES = [
  'blockchain', 'dex', 'cex', 'nft_collection', 'ordinals_collection',
  'web3_casino', 'stablecoin', 'rwa', 'depin', 'infrastructure_network',
  'crypto_treasury', 'miner', 'etf',
];

const SECTION_KEYS = [
  'what_it_is', 'what_happened', 'why_this_outcome', 'strategic_choices',
  'operating_model', 'token_and_value_capture', 'counterfactual',
  'risks_and_unknowns', 'lifecycle', 'outlook_and_watch',
];

export const ENTITY_PROFILE_BROWSER_FIXTURES = Object.fromEntries(TYPES.map((type) => [type, {
  schema: 'chaindump-entity-profile',
  version: 1,
  identity: { id: `${type}:example`, type, slug: 'example', name: `Example ${type}`, aliases: [] },
  classification: { subtype: 'fixture', tags: [], chains: ['Ethereum'], jurisdictions: [] },
  status: { operating_state: 'active', as_of: '2026-08-03', claim_ids: ['private-status-claim'] },
  outcome: { label: 'mixed', as_of: '2026-08-03', rule_id: 'private-rule', confidence: 'medium', claim_ids: ['private-outcome-claim'] },
  analysis: {
    sections: Object.fromEntries(SECTION_KEYS.map((key) => [key, {
      body: `${key.replaceAll('_', ' ')} for ${type}.`,
      as_of: '2026-08-03',
      claim_ids: [`private-${key}-claim`],
    }])),
  },
  metrics: [{
    id: `private-${type}-metric`, dimension: 'tvl', label: 'Observed value', value: 1234567,
    unit: 'usd', currency: 'USD', as_of: '2026-08-03', claim_ids: ['private-metric-claim'],
  }],
  sources: [{
    id: 'private-source-id', title: 'Readable evidence', publisher: 'Example Publisher',
    url: 'https://example.com/evidence', role: 'primary', tier: 'A', access_state: 'reachable',
  }],
  claims: [{ id: 'private-claim-record', field_path: 'analysis.sections.what_it_is.body' }],
  freshness: { state: 'current', last_reviewed_at: '2026-08-03', next_review_at: '2026-08-10', field_reviews: [] },
  quality: { publication_state: 'review', completeness_pct: 100, validation_errors: [{ path: 'private' }] },
  extensions: { legacy_origin: 'private-table', structured_analysis: { private_key: 'never render' } },
}]));

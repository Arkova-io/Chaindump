// Citation contract for the NFT / Ordinals lifecycle corpus.  The legacy
// collection rows predate field-level provenance; only rows explicitly marked
// `field-v1` are held to this stricter, publishable standard.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_BASES = new Set(['onchain', 'operator', 'marketplace', 'editorial', 'analyst']);
// These are the non-trivial profile fields the NFT view can render. A field-v1
// profile may omit them, but it may not render one without a matching evidence
// row. `launched` and `supply` intentionally map to normalized evidence names.
const RENDERED_FIELD_EVIDENCE = {
  launched: 'launch',
  supply: 'supply_or_mint',
  mint_price: 'mint_price',
  royalties_enforced: 'royalties_enforced',
  community_history: 'community_history',
  community_sentiment: 'community_sentiment',
  notable_holders: 'notable_holders',
  founder_engagement: 'founder_engagement',
  social: 'social',
  benefits: 'benefits',
  business: 'business',
  analysis: 'analysis',
};

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function parseNftProfile(value) {
  if (asObject(value)) return value;
  if (typeof value !== 'string') return null;
  try { return asObject(JSON.parse(value)); } catch { return null; }
}

export function parseNftSources(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function indexSources(sourcesValue) {
  const errors = [];
  const sources = parseNftSources(sourcesValue);
  const byId = new Map();
  for (const source of sources) {
    if (!asObject(source) || typeof source?.id !== 'string' || !source.id) {
      errors.push('Each field-v1 source needs a stable id');
      continue;
    }
    if (byId.has(source.id)) errors.push(`Duplicate source id: ${source.id}`);
    if (typeof source.title !== 'string' || !source.title.trim()) errors.push(`Source ${source.id} needs a title`);
    if (typeof source.url !== 'string' || !source.url.startsWith('https://')) errors.push(`Source ${source.id} needs an HTTPS URL`);
    byId.set(source.id, source);
  }
  return { errors, byId };
}

function validateEvidenceItem(item, byId, errors) {
  if (!asObject(item) || typeof item?.field !== 'string' || !item.field) {
    errors.push('Every evidence item needs a field');
    return null;
  }
  if (item.value === undefined || item.value === null || item.value === '') errors.push(`Evidence ${item.field} needs its displayed value`);
  if (typeof item.as_of !== 'string' || !ISO_DATE.test(item.as_of)) errors.push(`Evidence ${item.field} needs an ISO as_of date`);
  if (!VALID_BASES.has(item.basis)) errors.push(`Evidence ${item.field} has an invalid basis`);
  if (!Array.isArray(item.source_ids) || !item.source_ids.length) errors.push(`Evidence ${item.field} needs at least one source`);
  for (const id of item.source_ids ?? []) if (!byId.has(id)) errors.push(`Evidence ${item.field} references unknown source ${id}`);
  return item.field;
}

function validateEvidence(evidence, byId, errors) {
  return new Set(evidence.map((item) => validateEvidenceItem(item, byId, errors)).filter(Boolean));
}

function validateRequiredEvidence(profile, claimedFields, errors) {
  for (const required of ['launch', 'supply_or_mint', 'lifecycle_status']) {
    if (!claimedFields.has(required)) errors.push(`field-v1 profile needs ${required} evidence`);
  }
  for (const [profileField, evidenceField] of Object.entries(RENDERED_FIELD_EVIDENCE)) {
    const value = profile[profileField];
    if (value !== undefined && value !== null && value !== '' && !claimedFields.has(evidenceField)) {
      errors.push(`Rendered profile field ${profileField} needs ${evidenceField} evidence`);
    }
  }
}

export function validateFieldCitedNft(profileValue, sourcesValue) {
  const profile = parseNftProfile(profileValue);
  if (profile?.citation_schema !== 'field-v1') return { valid: true, errors: [] };
  const { errors, byId } = indexSources(sourcesValue);
  const evidence = Array.isArray(profile.evidence) ? profile.evidence : [];
  if (!evidence.length) errors.push('field-v1 profile needs non-empty evidence');
  const claimedFields = validateEvidence(evidence, byId, errors);
  validateRequiredEvidence(profile, claimedFields, errors);
  return { valid: errors.length === 0, errors };
}

export function fieldEvidence(profileValue, sourcesValue) {
  const profile = parseNftProfile(profileValue);
  if (profile?.citation_schema !== 'field-v1') return [];
  const sources = new Map(parseNftSources(sourcesValue).filter((source) => source?.id).map((source) => [source.id, source]));
  return (Array.isArray(profile.evidence) ? profile.evidence : []).map((item) => ({
    ...item,
    sources: (item.source_ids ?? []).map((id) => sources.get(id)).filter(Boolean),
  }));
}

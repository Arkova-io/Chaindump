// Promote a reviewed desk proposal into a live table. INJECTION-SAFE by design:
// the target table + column names come ONLY from the fixed whitelist below
// (never from the proposal), and every value is bound as a `?` param by the
// caller. JSON-typed columns are stringified. Tested by test/desk-promote.test.js.

export const PROMOTABLE = {
  scam_intel: {
    table: 'scam_intel',
    pk: 'slug',
    columns: ['slug', 'name', 'category', 'chain', 'approx_loss_usd', 'incident_date', 'severity',
      'credibility', 'status', 'culpable', 'connections', 'summary', 'how_it_happened', 'what_stolen',
      'aftermath', 'links', 'sources', 'debate_notes'],
    json: ['connections', 'links', 'sources'],
  },
  dead_chains: {
    table: 'dead_chains',
    pk: 'chain',
    columns: ['chain', 'launched', 'peak_tvl', 'current_tvl', 'drawdown_pct', 'peak_date', 'why',
      'outlook', 'verdict', 'sources', 'profile'],
    json: ['sources', 'profile'],
  },
  mid_chains: {
    table: 'mid_chains',
    pk: 'chain',
    columns: ['chain', 'launched', 'tvl', 'verdict', 'why_stuck', 'outlook', 'profile', 'sources'],
    json: ['profile', 'sources'],
  },
  risk_signals: {
    table: 'risk_signals',
    pk: 'slug',
    columns: ['slug', 'target', 'target_name', 'chain', 'signal_type', 'severity', 'description',
      'evidence', 'matched_addresses', 'matched_cases', 'status', 'confidence', 'sources'],
    json: ['evidence', 'matched_addresses', 'matched_cases', 'sources'],
  },
};

// Complex forensic-analysis proposals are evidence packets, not table rows.
// They must be reconciled with a canonical dossier by a human and therefore
// stay absent from PROMOTABLE. This server-side allowlist is independent of the
// agent's own gate: a compromised or stale proposal client cannot bypass it.
export const REVIEW_REQUIRED_PROPOSAL_DATASETS = Object.freeze([
  'blockchain_analysis_candidate',
  'exchange_analysis_candidate',
  'casino_analysis_candidate',
  'nft_lifecycle_candidate',
]);

function candidateSegment(value) {
  if (typeof value !== 'string') return '';
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  let start = 0;
  let end = normalized.length;
  while (normalized[start] === '-') start += 1;
  while (normalized[end - 1] === '-') end -= 1;
  return normalized.slice(start, end).slice(0, 80);
}

function validDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function validVerifiedTimestamp(value) {
  if (typeof value !== 'string' || !value.includes('T')) return false;
  const offset = value.slice(-6);
  const hasNumericOffset = ['+', '-'].includes(offset[0])
    && offset[3] === ':'
    && Number.isInteger(Number(offset.slice(1, 3)))
    && Number.isInteger(Number(offset.slice(4, 6)));
  if (!value.endsWith('Z') && !hasNumericOffset) return false;
  return Number.isFinite(Date.parse(value));
}

function canonicalHttpUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function validateResearchSource(source, index, sourceIds, sourceUrls) {
  const errors = [];
  const prefix = `sources[${index}]`;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return [`${prefix} must be an object`];
  }

  const id = typeof source.id === 'string' ? source.id.trim() : '';
  if (!id) errors.push(`${prefix}.id is required`);
  else if (sourceIds.has(id)) errors.push(`duplicate source id "${id}"`);
  else sourceIds.add(id);

  if (typeof source.title !== 'string' || !source.title.trim()) errors.push(`${prefix}.title is required`);
  if (typeof source.source_type !== 'string' || !source.source_type.trim()) errors.push(`${prefix}.source_type is required`);
  if (!validVerifiedTimestamp(source.verified_at)) errors.push(`${prefix}.verified_at must be an ISO timestamp with timezone`);
  if (source.verification_result !== 'resolved') errors.push(`${prefix}.verification_result must equal "resolved"`);

  const url = canonicalHttpUrl(source.url);
  if (!url) errors.push(`${prefix}.url must be an HTTP(S) URL`);
  else if (sourceUrls.has(url)) errors.push(`duplicate source URL "${url}"`);
  else sourceUrls.add(url);
  return errors;
}

function sourceReferenceErrors(sourceRefs, sourceIds) {
  const errors = [];
  for (const ref of sourceRefs) {
    if (!sourceIds.has(ref)) errors.push(`source_refs references missing source "${ref}"`);
  }
  for (const id of sourceIds) {
    if (!sourceRefs.includes(id)) errors.push(`source "${id}" is not mapped to this claim in source_refs`);
  }
  return errors;
}

/**
 * Stable queue key for one entity field at one evidence as-of date.
 *
 * The database already enforces UNIQUE(dataset, slug). Requiring this
 * server-derived shape makes that index a meaningful dedupe boundary rather
 * than trusting an agent to invent a different slug for the same claim.
 */
export function researchCandidateSlug(payload) {
  const entity = candidateSegment(payload?.entity_id);
  const field = candidateSegment(payload?.field_path);
  const asOf = validDateOnly(payload?.as_of) ? payload.as_of : '';
  return entity && field && asOf ? `${entity}--${field}--${asOf}` : '';
}

/**
 * Validate the evidence packet used by every cross-vertical analysis candidate.
 *
 * This is intentionally structural. The Worker must not fetch arbitrary
 * proposal URLs (an SSRF boundary); source truth is established by the
 * proposal agent's WebFetch pass and then reconciled by a human reviewer.
 */
export function validateResearchCandidateProposal(dataset, providedSlug, payload, sources) {
  if (!REVIEW_REQUIRED_PROPOSAL_DATASETS.includes(dataset)) {
    return { ok: true, canonicalSlug: providedSlug, errors: [] };
  }

  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, canonicalSlug: '', errors: ['payload must be an object'] };
  }
  for (const key of ['entity_id', 'field_path', 'claim']) {
    if (typeof payload[key] !== 'string' || !payload[key].trim()) errors.push(`${key} is required`);
  }
  if (!validDateOnly(payload.as_of)) errors.push('as_of must be a real YYYY-MM-DD date');

  const canonicalSlug = researchCandidateSlug(payload);
  if (!canonicalSlug || providedSlug !== canonicalSlug) {
    errors.push(`slug must equal canonical entity/field/as-of key "${canonicalSlug || 'unavailable'}"`);
  }

  const rawSourceRefs = Array.isArray(payload.source_refs) ? payload.source_refs : [];
  const sourceRefs = rawSourceRefs
    .filter((ref) => typeof ref === 'string' && ref.trim())
    .map((ref) => ref.trim());
  if (sourceRefs.length !== rawSourceRefs.length) errors.push('source_refs must contain only non-empty source ids');
  if (!sourceRefs.length) errors.push('source_refs must name at least one cited source');
  if (new Set(sourceRefs).size !== sourceRefs.length) errors.push('source_refs contains duplicate source ids');
  if (!Array.isArray(sources) || !sources.length) errors.push('sources must contain at least one verified citation');

  const sourceIds = new Set();
  const sourceUrls = new Set();
  for (const [index, source] of (Array.isArray(sources) ? sources : []).entries()) {
    errors.push(...validateResearchSource(source, index, sourceIds, sourceUrls));
  }

  errors.push(...sourceReferenceErrors(sourceRefs, sourceIds));

  return { ok: errors.length === 0, canonicalSlug, errors };
}

export function proposalNeedsHumanReview(dataset, namesIndividuals, confidence) {
  if (REVIEW_REQUIRED_PROPOSAL_DATASETS.includes(dataset)) return true;
  const highConfidence = Number.isFinite(confidence) && confidence >= 0.75;
  return Boolean(namesIndividuals) || !highConfidence;
}

/**
 * Build a safe INSERT plan for promoting a proposal.
 * @returns {{ table: string, pk: string, columns: string[], values: unknown[] }}
 * @throws if the dataset isn't promotable, the PK is missing, or there's nothing usable.
 */
export function promotionPlan(dataset, proposalSlug, payload, proposalSources) {
  const spec = PROMOTABLE[dataset];
  if (!spec) throw new Error(`dataset "${dataset}" is not promotable`);
  const p = { ...(payload || {}) };
  // slug-keyed tables default their PK from the proposal slug if the payload omits it
  if (spec.pk === 'slug' && (p.slug == null || String(p.slug).trim() === '')) p.slug = proposalSlug;
  // fall back to the proposal's verified sources if the payload didn't carry them
  if (proposalSources != null && p.sources == null) p.sources = proposalSources;
  if (p[spec.pk] == null || String(p[spec.pk]).trim() === '') {
    throw new Error(`missing primary key "${spec.pk}" for ${dataset}`);
  }
  const columns = [];
  const values = [];
  for (const col of spec.columns) {
    if (!(col in p) || p[col] == null) continue;
    let v = p[col];
    if (spec.json.includes(col) && typeof v !== 'string') v = JSON.stringify(v);
    columns.push(col);
    values.push(v);
  }
  if (columns.length < 2) throw new Error(`payload has no usable columns for ${dataset}`);
  return { table: spec.table, pk: spec.pk, columns, values };
}

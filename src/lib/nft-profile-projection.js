// Explicit adapter from the field-cited NFT dossier to the shared ten-section
// entity profile. This module intentionally understands only documented NFT
// dossier fields. It does not recursively flatten arbitrary objects into copy.

const SECTION_KEYS = Object.freeze([
  'what_it_is',
  'what_happened',
  'why_this_outcome',
  'strategic_choices',
  'operating_model',
  'token_and_value_capture',
  'counterfactual',
  'risks_and_unknowns',
  'lifecycle',
  'outlook_and_watch',
]);

const EVIDENCE_SECTION = Object.freeze({
  launch: 'what_it_is',
  supply_or_mint: 'what_it_is',
  mint_price: 'what_it_is',
  royalties_enforced: 'token_and_value_capture',
  lifecycle_status: 'lifecycle',
  community_history: 'what_happened',
  community_sentiment: 'what_happened',
  notable_holders: 'what_happened',
  founder_engagement: 'what_happened',
  social: 'what_happened',
  benefits: 'operating_model',
  business: 'what_it_is',
  analysis: 'lifecycle',
});

const NARRATIVE_EVIDENCE_FIELD = Object.freeze({
  business: 'business',
  community_history: 'community_history',
  community_sentiment: 'community_sentiment',
  notable_holders: 'notable_holders',
  founder_engagement: 'founder_engagement',
  social: 'social',
  benefits: 'benefits',
  analysis: 'analysis',
});

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sourceIdSet(sources) {
  return new Set((Array.isArray(sources) ? sources : [])
    .map((source) => objectValue(source)?.id || objectValue(source)?.source_id)
    .filter(Boolean));
}

function resolvedRefs(value, sources) {
  const refs = Array.isArray(value) ? value.filter((item) => text(item)) : [];
  return refs.length > 0 && refs.every((ref) => sources.has(ref)) ? refs : null;
}

function sentence(value) {
  const clean = text(value);
  if (!clean) return null;
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function joinParts(parts) {
  return parts.map(sentence).filter(Boolean).join('\n\n') || null;
}

function labelList(label, values) {
  const rows = (Array.isArray(values) ? values : []).map(text).filter(Boolean);
  return rows.length ? `${label}: ${rows.join('; ')}` : null;
}

function claimId(slug, path) {
  return `nft:${slug}:${String(path).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()}`;
}

function pendingClaim(slug, path, sourceIds, locator) {
  return {
    id: claimId(slug, path),
    field_path: path,
    source_ids: sourceIds,
    evidence_locator: locator,
    support_direction: 'supports',
    note: 'Imported from a field-cited legacy dossier; human review is still required.',
    review: { state: 'pending', reviewer: null, reviewed_at: null },
  };
}

function addSectionPart(state, section, value, claimIds = [], asOf = null) {
  const prose = text(value);
  if (!prose || !SECTION_KEYS.includes(section) || claimIds.length === 0) return;
  state.parts[section].push(prose);
  for (const id of claimIds) state.claimIds[section].add(id);
  if (asOf) state.dates[section].push(asOf);
}

function latestDate(values, fallback) {
  const valid = values.filter((value) => text(value) && Number.isFinite(Date.parse(value)));
  if (!valid.length) return fallback || null;
  return valid.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function addReferencedFinding({ state, slug, sources, section, path, value, refs, asOf, locator }) {
  const prose = text(value);
  const sourceIds = resolvedRefs(refs, sources);
  if (!prose || !sourceIds) return null;
  const claim = pendingClaim(slug, path, sourceIds, locator || path);
  state.claims.push(claim);
  addSectionPart(state, section, prose, [claim.id], asOf);
  return claim.id;
}

function evidenceProjection({ state, slug, profile, sources }) {
  const evidence = Array.isArray(profile.evidence) ? profile.evidence : [];
  const byField = new Map();
  evidence.forEach((item, index) => {
    const field = text(item?.field);
    const value = text(item?.value);
    const sourceIds = resolvedRefs(item?.source_ids, sources);
    const section = EVIDENCE_SECTION[field];
    if (!field || !value || !sourceIds || !section) return;
    const path = `profile.evidence.${field}`;
    const claim = pendingClaim(slug, path, sourceIds, `profile.evidence[${index}]`);
    state.claims.push(claim);
    byField.set(field, { claim, item });
    // Detailed authored prose is added below when available. The evidence value
    // remains a useful, bounded fallback for facts such as launch and supply.
    if (!Object.values(NARRATIVE_EVIDENCE_FIELD).includes(field)) {
      addSectionPart(state, section, value, [claim.id], item.as_of);
    }
  });
  for (const [profileField, evidenceField] of Object.entries(NARRATIVE_EVIDENCE_FIELD)) {
    const support = byField.get(evidenceField);
    const prose = text(profile[profileField]);
    if (!support || !prose) continue;
    addSectionPart(
      state,
      EVIDENCE_SECTION[evidenceField],
      prose,
      [support.claim.id],
      support.item.as_of,
    );
  }
  return byField;
}

function addKnownStructures({ state, slug, profile, sources, asOf }) {
  const add = (section, path, value, refs, locator = path) => addReferencedFinding({
    state, slug, sources, section, path, value, refs, asOf, locator,
  });

  const team = objectValue(profile.team);
  if (team) {
    add('operating_model', 'profile.team', joinParts([
      text(team.operator) ? `Operator: ${team.operator}` : null,
      text(team.owner_operator) ? `Owner and operator: ${team.owner_operator}` : null,
      text(team.identified_creative_lead) ? `Creative lead: ${team.identified_creative_lead}` : null,
      text(team.current_boundary) || text(team.scope_boundary) || text(team.post_closure_boundary),
    ]), team.source_ids);
  }

  const chronology = (Array.isArray(profile.chronology) ? profile.chronology : [])
    .map((item, index) => ({ item: objectValue(item), index }))
    .filter(({ item }) => item && text(item.event) && resolvedRefs(item.source_ids, sources));
  for (const { item, index } of chronology) {
    add('what_happened', `profile.chronology.${index}`,
      `${text(item.date) || 'Date not specified'} — ${item.event}`, item.source_ids,
      `profile.chronology[${index}]`);
  }

  const boundaries = objectValue(profile.market_holder_boundaries);
  if (boundaries) {
    add('token_and_value_capture', 'profile.market_holder_boundaries', joinParts([
      text(boundaries.market) ? `Market: ${boundaries.market}` : null,
      text(boundaries.holders) ? `Holders: ${boundaries.holders}` : null,
      text(boundaries.available_evidence),
    ]), boundaries.source_ids);
  }

  const products = objectValue(profile.products_and_value_capture);
  if (products) {
    add('operating_model', 'profile.products_and_value_capture', joinParts([
      labelList('Products', products.products),
      text(products.capture) ? `How value is captured: ${products.capture}` : null,
    ]), products.source_ids);
  }

  const tokenModel = objectValue(profile.token_model);
  if (tokenModel) {
    add('token_and_value_capture', 'profile.token_model', joinParts([
      tokenModel.token,
      tokenModel.boundary,
    ]), tokenModel.source_ids);
  }

  const chain = objectValue(profile.chain_dependence);
  if (chain) add('operating_model', 'profile.chain_dependence', chain.finding, chain.source_ids);

  const why = objectValue(profile.why);
  if (why) add('why_this_outcome', 'profile.why', why.finding || why.summary, why.source_ids || why.source_refs);

  for (const [index, itemValue] of (Array.isArray(profile.strategic_choices) ? profile.strategic_choices : []).entries()) {
    const item = objectValue(itemValue);
    if (!item) continue;
    add('strategic_choices', `profile.strategic_choices.${index}`, joinParts([
      item.choice || item.decision,
      item.consequence ? `Result: ${item.consequence}` : null,
    ]), item.source_ids || item.source_refs, `profile.strategic_choices[${index}]`);
  }

  const counterfactual = objectValue(profile.counterfactual);
  if (counterfactual) {
    add('counterfactual', 'profile.counterfactual', counterfactual.finding || counterfactual.summary,
      counterfactual.source_ids || counterfactual.source_refs);
  }

  const citedRisks = [];
  const riskClaimIds = [];
  for (const [index, itemValue] of (Array.isArray(profile.risks) ? profile.risks : []).entries()) {
    const item = objectValue(itemValue);
    const risk = text(item?.risk);
    const sourceIds = resolvedRefs(item?.source_ids, sources);
    if (!risk || !sourceIds) continue;
    const claim = pendingClaim(slug, `profile.risks.${index}`, sourceIds, `profile.risks[${index}]`);
    state.claims.push(claim);
    citedRisks.push(risk);
    riskClaimIds.push(claim.id);
  }
  if (citedRisks.length) {
    addSectionPart(state, 'risks_and_unknowns', labelList('Risks', citedRisks), riskClaimIds, asOf);
    const unknowns = labelList('Still unknown', profile.unknowns);
    if (unknowns) addSectionPart(state, 'risks_and_unknowns', unknowns, riskClaimIds, asOf);
  }

  const forensic = objectValue(profile.forensic_analysis);
  const forensicWhy = objectValue(forensic?.why);
  if (!state.parts.why_this_outcome.length && forensicWhy) {
    add('why_this_outcome', 'profile.forensic_analysis.why', forensicWhy.summary,
      forensicWhy.source_refs, 'profile.forensic_analysis.why');
  }
  if (!state.parts.strategic_choices.length) {
    for (const [index, itemValue] of (Array.isArray(forensic?.strategic_choices) ? forensic.strategic_choices : []).entries()) {
      const item = objectValue(itemValue);
      if (!item) continue;
      add('strategic_choices', `profile.forensic_analysis.strategic_choices.${index}`, joinParts([
        item.decision,
        item.consequence ? `Result: ${item.consequence}` : null,
      ]), item.source_refs, `profile.forensic_analysis.strategic_choices[${index}]`);
    }
  }
  const forensicCounterfactual = objectValue(forensic?.counterfactual);
  if (!state.parts.counterfactual.length && forensicCounterfactual) {
    add('counterfactual', 'profile.forensic_analysis.counterfactual', forensicCounterfactual.summary,
      forensicCounterfactual.source_refs, 'profile.forensic_analysis.counterfactual');
  }
  for (const [index, itemValue] of (Array.isArray(forensic?.watch) ? forensic.watch : []).entries()) {
    const item = objectValue(itemValue);
    if (!item) continue;
    add('outlook_and_watch', `profile.forensic_analysis.watch.${index}`, joinParts([
      item.signal,
      item.implication ? `Why it matters: ${item.implication}` : null,
    ]), item.source_refs, `profile.forensic_analysis.watch[${index}]`);
  }
  if (state.parts.outlook_and_watch.length) {
    const review = objectValue(profile.review) || objectValue(forensic?.review);
    const triggers = labelList('Next review triggers', review?.triggers);
    const ids = [...state.claimIds.outlook_and_watch];
    if (triggers && ids.length) addSectionPart(state, 'outlook_and_watch', triggers, ids, asOf);
  }
}

export function projectFieldCitedNftProfile({ slug, profile, sources, asOf = null } = {}) {
  const sourceIds = sourceIdSet(sources);
  const sourceProfile = objectValue(profile) || {};
  const state = {
    parts: Object.fromEntries(SECTION_KEYS.map((key) => [key, []])),
    claimIds: Object.fromEntries(SECTION_KEYS.map((key) => [key, new Set()])),
    dates: Object.fromEntries(SECTION_KEYS.map((key) => [key, []])),
    claims: [],
  };
  if (sourceProfile.citation_schema !== 'field-v1' || !text(slug)) {
    return { sections: {}, section_dates: {}, section_claim_ids: {}, claims: [] };
  }

  evidenceProjection({ state, slug, profile: sourceProfile, sources: sourceIds });
  addKnownStructures({ state, slug, profile: sourceProfile, sources: sourceIds, asOf });

  return {
    sections: Object.fromEntries(SECTION_KEYS
      .map((key) => [key, joinParts(state.parts[key])])
      .filter(([, value]) => value)),
    section_dates: Object.fromEntries(SECTION_KEYS
      .filter((key) => state.parts[key].length)
      .map((key) => [key, latestDate(state.dates[key], asOf)])),
    section_claim_ids: Object.fromEntries(SECTION_KEYS
      .filter((key) => state.claimIds[key].size)
      .map((key) => [key, [...state.claimIds[key]]])),
    claims: state.claims,
  };
}


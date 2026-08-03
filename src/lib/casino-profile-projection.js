// Citation-bounded projection from the normalized casino dossier tables into
// the shared ten-section entity profile. It understands only named casino
// fields and explicit forensic structures. Missing or unresolved evidence is
// omitted instead of being flattened into plausible-sounding copy.

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

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function parseObject(value) {
  if (objectValue(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try { return objectValue(JSON.parse(value)) || {}; } catch { return {}; }
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sentence(value) {
  const prose = text(value);
  if (!prose) return null;
  return /[.!?]$/.test(prose) ? prose : `${prose}.`;
}

function joinParts(parts) {
  return parts.map(sentence).filter(Boolean).join('\n\n') || null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function claimId(slug, path) {
  const suffix = String(path).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return `casino:${slug}:profile:${suffix}`;
}

function pendingClaim(slug, path, sourceIds, locator, note = null) {
  return {
    id: claimId(slug, path),
    field_path: path,
    source_ids: sourceIds,
    evidence_locator: locator,
    support_direction: 'supports',
    note: note || 'Projected from explicit casino evidence; human review is still required.',
    review: { state: 'pending', reviewer: null, reviewed_at: null },
  };
}

function sourceIndexes(sources) {
  const byId = new Map();
  const byUrl = new Map();
  for (const source of Array.isArray(sources) ? sources : []) {
    const id = text(source?.id) || text(source?.source_id);
    const url = text(source?.url) || text(source?.canonical_url);
    if (id) byId.set(id, source);
    if (id && url) byUrl.set(url, id);
  }
  return { byId, byUrl };
}

function claimIndex(claims) {
  return new Map((Array.isArray(claims) ? claims : [])
    .filter((claim) => text(claim?.id) || text(claim?.claim_id))
    .map((claim) => [text(claim.id) || text(claim.claim_id), claim]));
}

function sourceIdsFromRefs(refs, indexes) {
  const values = parseArray(refs).map(text).filter(Boolean);
  if (!values.length) return null;
  const resolved = [];
  for (const value of values) {
    if (indexes.byId.has(value)) resolved.push(value);
    else if (indexes.byUrl.has(value)) resolved.push(indexes.byUrl.get(value));
    else return null;
  }
  return unique(resolved);
}

function sourceIdsFromClaimIds(claimIds, claimsById, indexes) {
  const values = parseArray(claimIds).map(text).filter(Boolean);
  if (!values.length) return null;
  const resolved = [];
  for (const id of values) {
    const claim = claimsById.get(id);
    if (!claim) return null;
    const sourceIds = parseArray(claim.source_ids || [claim.source_id]);
    if (!sourceIds.length || sourceIds.some((sourceId) => !indexes.byId.has(sourceId))) return null;
    resolved.push(...sourceIds);
  }
  return unique(resolved);
}

function addPart(state, section, prose, claim) {
  const body = text(prose);
  if (!body || !claim || !SECTION_KEYS.includes(section)) return;
  state.parts[section].push(body);
  state.claimIds[section].add(claim.id);
  state.claims.push(claim);
}

function addFromSourceRefs(state, context, section, path, prose, refs, locator = path, note = null) {
  const sourceIds = sourceIdsFromRefs(refs, context.sourceIndexes);
  if (!text(prose) || !sourceIds) return null;
  const claim = pendingClaim(context.slug, path, sourceIds, locator, note);
  addPart(state, section, prose, claim);
  return claim.id;
}

function addFromClaimRefs(state, context, section, path, prose, refs, locator = path, note = null) {
  const sourceIds = sourceIdsFromClaimIds(refs, context.claimsById, context.sourceIndexes);
  if (!text(prose) || !sourceIds) return null;
  const claim = pendingClaim(context.slug, path, sourceIds, locator, note);
  addPart(state, section, prose, claim);
  return claim.id;
}

function relevantClaimIds(claims, predicate) {
  return (Array.isArray(claims) ? claims : [])
    .filter(predicate)
    .map((claim) => text(claim?.id) || text(claim?.claim_id))
    .filter(Boolean);
}

export function projectCasinoProfile({
  slug,
  caseRow,
  synthesis,
  sources,
  claims,
  events,
  asOf = null,
} = {}) {
  const scopedCase = objectValue(caseRow) || {};
  const scopedSynthesis = objectValue(synthesis) || {};
  const outlook = parseObject(scopedSynthesis.outlook);
  const forensic = parseObject(outlook.forensic_analysis);
  const context = {
    slug: text(slug),
    sourceIndexes: sourceIndexes(sources),
    claimsById: claimIndex(claims),
  };
  const state = {
    parts: Object.fromEntries(SECTION_KEYS.map((key) => [key, []])),
    claimIds: Object.fromEntries(SECTION_KEYS.map((key) => [key, new Set()])),
    claims: [],
  };
  if (!context.slug) return { sections: {}, section_claim_ids: {}, claims: [] };

  const synthesisClaimIds = parseArray(scopedSynthesis.source_claim_ids);
  const identityClaimIds = relevantClaimIds(claims, (claim) => (
    claim?.claim_type === 'identity' || String(claim?.field_path || '').startsWith('identity.')
  ));
  const statusClaimIds = relevantClaimIds(claims, (claim) => (
    String(claim?.field_path || '').includes('status')
  ));

  const scopedIdentityClaimId = addFromClaimRefs(
    state,
    context,
    'what_it_is',
    'analysis.sections.what_it_is.body',
    scopedCase.product_scope_note,
    identityClaimIds,
    'casino_cases.product_scope_note',
  );
  if (!scopedIdentityClaimId) {
    addFromClaimRefs(
      state,
      context,
      'what_it_is',
      'analysis.sections.what_it_is.body',
      scopedCase.product_scope_note,
      synthesisClaimIds,
      'casino_cases.product_scope_note',
      'The scope statement is bounded by the complete cited synthesis record; it does not extend to similarly named products.',
    );
  }
  addFromClaimRefs(
    state,
    context,
    'what_happened',
    'analysis.sections.what_happened.body',
    scopedSynthesis.present_situation,
    synthesisClaimIds,
    'casino_syntheses.present_situation',
  );

  const forensicWhy = parseObject(forensic.why);
  if (!addFromSourceRefs(
    state,
    context,
    'why_this_outcome',
    'analysis.sections.why_this_outcome.body',
    forensicWhy.summary,
    forensicWhy.source_refs,
    'casino_syntheses.outlook.forensic_analysis.why',
    'Causal interpretation is bounded by the cited evidence and is not a controlled causal estimate.',
  )) {
    addFromClaimRefs(
      state,
      context,
      'why_this_outcome',
      'analysis.sections.why_this_outcome.body',
      scopedSynthesis.success_failure_hypotheses,
      synthesisClaimIds,
      'casino_syntheses.success_failure_hypotheses',
      'Hypothesis only; the cited record does not isolate every causal contribution.',
    );
  }

  for (const [index, choiceValue] of parseArray(forensic.strategic_choices).entries()) {
    const choice = objectValue(choiceValue);
    if (!choice) continue;
    addFromSourceRefs(
      state,
      context,
      'strategic_choices',
      `analysis.sections.strategic_choices.choice.${index}`,
      joinParts([choice.decision, choice.consequence]),
      choice.source_refs,
      `casino_syntheses.outlook.forensic_analysis.strategic_choices[${index}]`,
      'Choice and consequence are analyst synthesis of the cited record.',
    );
  }

  addFromClaimRefs(
    state,
    context,
    'operating_model',
    'analysis.sections.operating_model.business_mechanism',
    scopedSynthesis.business_mechanism,
    synthesisClaimIds,
    'casino_syntheses.business_mechanism',
  );
  addFromClaimRefs(
    state,
    context,
    'operating_model',
    'analysis.sections.operating_model.chain_dependence',
    scopedSynthesis.chain_dependence,
    synthesisClaimIds,
    'casino_syntheses.chain_dependence',
  );
  addFromClaimRefs(
    state,
    context,
    'token_and_value_capture',
    'analysis.sections.token_and_value_capture.body',
    scopedSynthesis.token_contribution,
    synthesisClaimIds,
    'casino_syntheses.token_contribution',
  );

  const counterfactual = parseObject(forensic.counterfactual);
  if (!addFromSourceRefs(
    state,
    context,
    'counterfactual',
    'analysis.sections.counterfactual.body',
    counterfactual.summary,
    counterfactual.source_refs,
    'casino_syntheses.outlook.forensic_analysis.counterfactual',
    'Counterfactual controls analysis; no causal estimate is available.',
  )) {
    addFromClaimRefs(
      state,
      context,
      'counterfactual',
      'analysis.sections.counterfactual.body',
      scopedSynthesis.counterfactual,
      synthesisClaimIds,
      'casino_syntheses.counterfactual',
      'Counterfactual controls analysis; no causal estimate is available.',
    );
  }

  const unknowns = parseArray(forensic.unknowns).map(text).filter(Boolean);
  addFromClaimRefs(
    state,
    context,
    'risks_and_unknowns',
    'analysis.sections.risks_and_unknowns.body',
    joinParts([
      scopedSynthesis.risk_legal_posture,
      unknowns.length ? `Still unknown: ${unknowns.join('; ')}` : null,
    ]),
    synthesisClaimIds,
    'casino_syntheses.risk_legal_posture and forensic_analysis.unknowns',
  );

  const eventRows = Array.isArray(events) ? events : [];
  for (const [index, event] of eventRows.entries()) {
    const description = text(event?.description);
    const date = text(event?.event_date) || text(event?.date);
    const refs = event?.source_claim_ids;
    addFromClaimRefs(
      state,
      context,
      'what_happened',
      `analysis.sections.what_happened.event.${index}`,
      description && date ? `${date} — ${description}` : description,
      refs,
      `casino_events[${index}]`,
    );
    addFromClaimRefs(
      state,
      context,
      'lifecycle',
      `analysis.sections.lifecycle.event.${index}`,
      description && date ? `${date} — ${description}` : description,
      refs,
      `casino_events[${index}]`,
    );
  }
  if (!state.parts.lifecycle.length) {
    addFromClaimRefs(
      state,
      context,
      'lifecycle',
      'analysis.sections.lifecycle.current_record',
      scopedSynthesis.present_situation,
      synthesisClaimIds,
      'casino_syntheses.present_situation',
      'Current lifecycle description only; no dated milestone was supported in the structured event record.',
    );
  }
  addFromClaimRefs(
    state,
    context,
    'lifecycle',
    'analysis.sections.lifecycle.current_status',
    scopedCase.status && (scopedCase.status_as_of || asOf)
      ? `${scopedCase.status_as_of || asOf} — The scoped product was ${scopedCase.status}`
      : null,
    statusClaimIds,
    'casino_cases.status and status_as_of',
  );

  for (const [index, watchValue] of parseArray(forensic.watch).entries()) {
    const watch = objectValue(watchValue);
    if (!watch) continue;
    addFromSourceRefs(
      state,
      context,
      'outlook_and_watch',
      `analysis.sections.outlook_and_watch.signal.${index}`,
      joinParts([watch.signal, watch.implication]),
      watch.source_refs,
      `casino_syntheses.outlook.forensic_analysis.watch[${index}]`,
      'Forward watch signal, not a forecast.',
    );
  }

  const outcome = parseObject(forensic.outcome);
  // Outcome lives outside the analysis sections, so resolve and attach its
  // citation separately instead of pretending it belongs to a prose section.
  let resolvedOutcomeClaimId = null;
  if (text(outcome.summary)) {
    const sourceIds = sourceIdsFromRefs(outcome.source_refs, context.sourceIndexes);
    if (sourceIds) {
      const claim = pendingClaim(
        context.slug,
        'outcome.label',
        sourceIds,
        'casino_syntheses.outlook.forensic_analysis.outcome',
        'Analyst lifecycle classification bounded by the cited record.',
      );
      state.claims.push(claim);
      resolvedOutcomeClaimId = claim.id;
    }
  }

  return {
    sections: Object.fromEntries(SECTION_KEYS
      .map((key) => [key, joinParts(state.parts[key])])
      .filter(([, body]) => body)),
    section_dates: Object.fromEntries(SECTION_KEYS
      .filter((key) => state.parts[key].length)
      .map((key) => [key, asOf])),
    section_claim_ids: Object.fromEntries(SECTION_KEYS
      .filter((key) => state.claimIds[key].size)
      .map((key) => [key, [...state.claimIds[key]]])),
    claims: state.claims,
    outcome_claim_ids: resolvedOutcomeClaimId ? [resolvedOutcomeClaimId] : [],
    status_claim_ids: statusClaimIds,
    supported_section_count: SECTION_KEYS.filter((key) => state.parts[key].length).length,
  };
}

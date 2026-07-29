// Category-neutral, evidence-gated forensic analysis.
//
// This module is deliberately pure: callers provide the analysis record and an
// optional reference resolver, and receive a new normalized value plus issues.
// It performs no I/O and never invents review dates or evidence.

export const FORENSIC_ANALYSIS_VERSION = 'forensic-analysis-v1';

export const FORENSIC_OUTCOMES = Object.freeze([
  'thriving',
  'successful',
  'middling',
  'recovering',
  'declining',
  'failed',
  'dead',
  'unclassified',
]);

export const FORENSIC_CAUSAL_SECTIONS = Object.freeze([
  'why',
  'strategic_choices',
  'counterfactual',
]);

const CONFIDENCE = new Set(['high', 'medium', 'low', 'unknown']);
const REVIEW_STATUSES = new Set(['current', 'review_due', 'needs_review']);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS_URL = /^https:\/\/[^\s]+$/;

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sourceRefList(section) {
  if (!isObject(section)) return [];
  if (Array.isArray(section.source_refs)) return section.source_refs;
  return Array.isArray(section.refs) ? section.refs : [];
}

function refIdentity(reference) {
  if (typeof reference === 'string') return reference;
  if (!isObject(reference)) return null;
  return reference.ref || reference.source_id || reference.id || reference.url || null;
}

function normalizeResolvedReference(reference, resolved) {
  const original = isObject(reference) ? reference : {};
  const resolution = typeof resolved === 'string' ? { url: resolved } : resolved;
  if (!isObject(resolution) || !HTTPS_URL.test(resolution.url || '')) return null;

  const ref = original.ref
    || original.source_id
    || original.id
    || (typeof reference === 'string' && !HTTPS_URL.test(reference) ? reference : null);

  return {
    ...(ref ? { ref } : {}),
    url: resolution.url,
    ...(nonEmpty(resolution.title) ? { title: resolution.title.trim() } : {}),
    ...(nonEmpty(resolution.publisher) ? { publisher: resolution.publisher.trim() } : {}),
  };
}

function resolveReference(reference, resolver, context) {
  if (typeof reference === 'string' && HTTPS_URL.test(reference)) {
    return { url: reference };
  }
  if (isObject(reference) && HTTPS_URL.test(reference.url || '')) {
    return normalizeResolvedReference(reference, reference);
  }

  const key = refIdentity(reference);
  if (!key || !resolver) return null;

  let resolved;
  try {
    resolved = typeof resolver === 'function'
      ? resolver(key, context)
      : resolver[key];
  } catch {
    return null;
  }
  return normalizeResolvedReference(reference, resolved);
}

function normalizeReferences(section, path, resolver, errors) {
  const references = sourceRefList(section);
  const normalized = [];
  const seen = new Set();

  for (const [index, reference] of references.entries()) {
    const resolved = resolveReference(reference, resolver, { path, index });
    if (!resolved) {
      errors.push(`${path}.source_refs[${index}]: unresolved reference`);
      continue;
    }
    if (seen.has(resolved.url)) continue;
    seen.add(resolved.url);
    normalized.push(resolved);
  }

  return normalized;
}

function requireObject(value, path, errors) {
  if (isObject(value)) return true;
  errors.push(`${path}: object required`);
  return false;
}

function requireArray(value, path, errors) {
  if (Array.isArray(value)) return true;
  errors.push(`${path}: array required`);
  return false;
}

function requireText(value, path, errors) {
  if (nonEmpty(value)) return value.trim();
  errors.push(`${path}: non-empty text required`);
  return null;
}

function normalizeConfidence(value, path, errors) {
  if (CONFIDENCE.has(value)) return value;
  errors.push(`${path}: expected high, medium, low, or unknown`);
  return 'unknown';
}

function requireDay(value, path, errors) {
  if (ISO_DAY.test(value || '')) return value;
  errors.push(`${path}: expected YYYY-MM-DD`);
  return null;
}

function requireEvidence(references, path, errors) {
  if (references.length > 0) return true;
  errors.push(`${path}.source_refs: at least one resolving evidence reference is required`);
  return false;
}

function normalizeOutcome(outcome, resolver, errors) {
  if (!requireObject(outcome, 'outcome', errors)) return null;
  const label = outcome.label;
  if (!FORENSIC_OUTCOMES.includes(label)) {
    errors.push(`outcome.label: invalid outcome ${label}`);
  }
  const references = normalizeReferences(outcome, 'outcome', resolver, errors);
  requireEvidence(references, 'outcome', errors);
  return {
    label: FORENSIC_OUTCOMES.includes(label) ? label : 'unclassified',
    summary: requireText(outcome.summary, 'outcome.summary', errors),
    confidence: normalizeConfidence(outcome.confidence, 'outcome.confidence', errors),
    as_of: requireDay(outcome.as_of, 'outcome.as_of', errors),
    source_refs: references,
  };
}

function normalizeWhy(why, resolver, errors) {
  if (!requireObject(why, 'why', errors)) return { value: null, supported: false };
  const references = normalizeReferences(why, 'why', resolver, errors);
  const text = requireText(why.summary, 'why.summary', errors);
  const supported = Boolean(text) && requireEvidence(references, 'why', errors);
  return {
    value: {
      summary: text,
      confidence: normalizeConfidence(why.confidence, 'why.confidence', errors),
      source_refs: references,
    },
    supported,
  };
}

function normalizeStrategicChoices(choices, resolver, errors) {
  if (!requireArray(choices, 'strategic_choices', errors)) {
    return { value: [], supported: false };
  }
  if (choices.length === 0) {
    errors.push('strategic_choices: at least one choice is required');
  }

  let allSupported = choices.length > 0;
  const value = choices.map((choice, index) => {
    const path = `strategic_choices[${index}]`;
    if (!requireObject(choice, path, errors)) {
      allSupported = false;
      return null;
    }
    const references = normalizeReferences(choice, path, resolver, errors);
    const decision = requireText(choice.decision, `${path}.decision`, errors);
    const consequence = requireText(choice.consequence, `${path}.consequence`, errors);
    const supported = Boolean(decision && consequence)
      && requireEvidence(references, path, errors);
    if (!supported) allSupported = false;
    return {
      decision,
      consequence,
      confidence: normalizeConfidence(choice.confidence, `${path}.confidence`, errors),
      source_refs: references,
    };
  }).filter(Boolean);

  return { value, supported: allSupported };
}

function normalizeCounterfactual(counterfactual, resolver, errors) {
  if (!requireObject(counterfactual, 'counterfactual', errors)) {
    return { value: null, supported: false };
  }
  const references = normalizeReferences(counterfactual, 'counterfactual', resolver, errors);
  const text = requireText(counterfactual.summary, 'counterfactual.summary', errors);
  const supported = Boolean(text) && requireEvidence(references, 'counterfactual', errors);
  return {
    value: {
      summary: text,
      confidence: normalizeConfidence(
        counterfactual.confidence,
        'counterfactual.confidence',
        errors,
      ),
      source_refs: references,
    },
    supported,
  };
}

function normalizeWatch(watch, resolver, errors) {
  if (!requireArray(watch, 'watch', errors)) return [];
  return watch.map((item, index) => {
    const path = `watch[${index}]`;
    if (!requireObject(item, path, errors)) return null;
    const references = normalizeReferences(item, path, resolver, errors);
    requireEvidence(references, path, errors);
    return {
      signal: requireText(item.signal, `${path}.signal`, errors),
      implication: requireText(item.implication, `${path}.implication`, errors),
      source_refs: references,
    };
  }).filter(Boolean);
}

function normalizeUnknowns(unknowns, errors) {
  if (!requireArray(unknowns, 'unknowns', errors)) return [];
  if (unknowns.length === 0) errors.push('unknowns: at least one explicit unknown is required');
  return unknowns.map((unknown, index) => {
    if (typeof unknown === 'string') {
      return requireText(unknown, `unknowns[${index}]`, errors);
    }
    if (!requireObject(unknown, `unknowns[${index}]`, errors)) return null;
    return {
      question: requireText(unknown.question, `unknowns[${index}].question`, errors),
      ...(nonEmpty(unknown.resolution_trigger)
        ? { resolution_trigger: unknown.resolution_trigger.trim() }
        : {}),
    };
  }).filter(Boolean);
}

function normalizeReview(review, errors) {
  if (!requireObject(review, 'review', errors)) return null;
  if (!REVIEW_STATUSES.has(review.status)) {
    errors.push(`review.status: expected current, review_due, or needs_review`);
  }
  const lastReviewedAt = requireDay(
    review.last_reviewed_at,
    'review.last_reviewed_at',
    errors,
  );
  const nextReviewAt = requireDay(review.next_review_at, 'review.next_review_at', errors);
  if (lastReviewedAt && nextReviewAt && nextReviewAt < lastReviewedAt) {
    errors.push('review.next_review_at: cannot precede last_reviewed_at');
  }
  return {
    status: REVIEW_STATUSES.has(review.status) ? review.status : 'needs_review',
    last_reviewed_at: lastReviewedAt,
    next_review_at: nextReviewAt,
    reviewer: requireText(review.reviewer, 'review.reviewer', errors),
  };
}

function inspect(input, options = {}) {
  const errors = [];
  const warnings = [];
  const withheldSections = [];
  const resolver = options.resolveRef || options.resolver || null;

  if (!isObject(input)) {
    return {
      value: null,
      errors: ['analysis: object required'],
      warnings,
      withheld_sections: [...FORENSIC_CAUSAL_SECTIONS],
    };
  }
  if (input.version !== FORENSIC_ANALYSIS_VERSION) {
    errors.push(`version: expected ${FORENSIC_ANALYSIS_VERSION}`);
  }

  const outcome = normalizeOutcome(input.outcome, resolver, errors);
  const why = normalizeWhy(input.why, resolver, errors);
  const strategicChoices = normalizeStrategicChoices(
    input.strategic_choices,
    resolver,
    errors,
  );
  const counterfactual = normalizeCounterfactual(input.counterfactual, resolver, errors);

  const withhold = (name, section) => {
    if (section.supported) return section.value;
    withheldSections.push(name);
    warnings.push(`${name}: withheld because causal support is incomplete`);
    return name === 'strategic_choices' ? [] : null;
  };

  const value = {
    version: FORENSIC_ANALYSIS_VERSION,
    outcome,
    why: withhold('why', why),
    strategic_choices: withhold('strategic_choices', strategicChoices),
    counterfactual: withhold('counterfactual', counterfactual),
    watch: normalizeWatch(input.watch, resolver, errors),
    unknowns: normalizeUnknowns(input.unknowns, errors),
    review: normalizeReview(input.review, errors),
  };

  return {
    value,
    errors,
    warnings,
    withheld_sections: withheldSections,
  };
}

export function normalizeForensicAnalysis(input, options = {}) {
  return inspect(input, options);
}

export function validateForensicAnalysis(input, options = {}) {
  const result = inspect(input, options);
  return {
    errors: result.errors,
    warnings: result.warnings,
    withheld_sections: result.withheld_sections,
  };
}

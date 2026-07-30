// Cross-vertical report contract. The browser renderer mirrors this ordering so
// blockchain, DEX/CEX, casino and NFT/Ordinals reports remain comparable.
export const NORMALIZED_DOSSIER_VERSION = 'normalized-dossier-v1';

export const NORMALIZED_DOSSIER_SECTIONS = Object.freeze([
  ['what_it_is', 'What it is'],
  ['what_happened', 'What happened'],
  ['why', 'Why this outcome'],
  ['strategic_choices', 'Strategic choices'],
  ['operating_model', 'Operating model'],
  ['token_value_capture', 'Token and value capture'],
  ['evidence', 'Evidence and sources'],
  ['counterfactual', 'What could have been different'],
  ['risks_unknowns', 'Risks and unknowns'],
  ['lifecycle', 'Lifecycle read'],
  ['outlook_watch', 'Outlook and what to watch'],
  ['review_metadata', 'Review metadata'],
]);

const SECTION_KEYS = new Set(NORMALIZED_DOSSIER_SECTIONS.map(([key]) => key));

export function normalizeDossier(input = {}) {
  const sections = {};
  for (const [key] of NORMALIZED_DOSSIER_SECTIONS) {
    const value = input[key] ?? input[camelCase(key)] ?? null;
    sections[key] = value == null || value === '' ? null : value;
  }
  return {
    schema: NORMALIZED_DOSSIER_VERSION,
    category: input.category || 'forensics',
    name: input.name || 'Unnamed case',
    status: input.status || 'unknown',
    metric: input.metric ?? null,
    as_of: input.as_of || input.asOf || null,
    sections,
    sources: Array.isArray(input.sources) ? input.sources : [],
  };
}

export function validateDossier(dossier) {
  const errors = [];
  if (!dossier || dossier.schema !== NORMALIZED_DOSSIER_VERSION) errors.push('schema must be normalized-dossier-v1');
  if (!dossier?.name) errors.push('name is required');
  if (!dossier?.sections || typeof dossier.sections !== 'object') errors.push('sections are required');
  for (const key of SECTION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(dossier?.sections || {}, key)) errors.push(`missing section: ${key}`);
  }
  if (!Array.isArray(dossier?.sources)) errors.push('sources must be an array');
  return errors;
}

function camelCase(value) {
  return value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

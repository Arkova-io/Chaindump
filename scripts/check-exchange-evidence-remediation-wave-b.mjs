import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ARTIFACT_URL = new URL(
  '../docs/exchange-evidence-remediation-wave-b-2026-07-29.json',
  import.meta.url,
);

export const REQUIRED_CLAIM_TOPICS = [
  'outcome',
  'why',
  'strategic_choices',
  'token',
  'chain_dependence',
  'legal_or_loss',
];

const REVIEW_STATES = new Set([
  'reviewed',
  'partially_reviewed',
  'unresolved',
]);

const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);

const ACCESSIBLE_STATES = new Set([
  'accessible',
  'accessible_interface_only',
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateSource(source, dossierId) {
  const prefix = `${dossierId} source ${source.id ?? '<missing-id>'}`;

  for (const field of [
    'id',
    'title',
    'publisher',
    'url',
    'source_tier',
    'source_role',
    'independence_group',
    'access_state',
    'access_method',
    'evidence_locator',
  ]) {
    assert(isNonEmptyString(source[field]), `${prefix} missing ${field}`);
  }

  assert(
    ['A', 'B', 'C', 'D'].includes(source.source_tier),
    `${prefix} has invalid source_tier`,
  );
  assert(
    /^https:\/\//.test(source.url),
    `${prefix} must use a canonical HTTPS URL`,
  );
  assert(
    typeof source.evidence_reviewed === 'boolean',
    `${prefix} evidence_reviewed must be boolean`,
  );
  if (source.evidence_reviewed) {
    assert(
      isNonEmptyString(source.evidence_reviewer),
      `${prefix} reviewed evidence needs evidence_reviewer`,
    );
    assert(
      /^\d{4}-\d{2}-\d{2}T/.test(source.evidence_reviewed_at ?? ''),
      `${prefix} reviewed evidence needs evidence_reviewed_at`,
    );
    assert(
      ACCESSIBLE_STATES.has(source.access_state),
      `${prefix} cannot be reviewed with access_state=${source.access_state}`,
    );
    assert(
      source.evidence_locator.length >= 35,
      `${prefix} reviewed evidence locator is too shallow`,
    );
  } else {
    assert(
      source.evidence_reviewer === undefined &&
        source.evidence_reviewed_at === undefined,
      `${prefix} unreviewed evidence cannot credit a reviewer or review time`,
    );
  }
  assert(
    source.reviewed_at === undefined,
    `${prefix} uses deprecated reviewed_at instead of evidence review fields`,
  );
}

function validateClaim(claim, topic, dossierId, sourceById) {
  const prefix = `${dossierId} claim ${topic}`;

  assert(claim && typeof claim === 'object', `${prefix} must be an object`);
  assert(
    typeof claim.value === 'string' || Array.isArray(claim.value),
    `${prefix} value must be text or an array`,
  );
  if (Array.isArray(claim.value)) {
    assert(
      topic === 'strategic_choices' && claim.value.length >= 2,
      `${prefix} array is allowed only for at least two strategic choices`,
    );
    assert(
      claim.value.every(isNonEmptyString),
      `${prefix} strategic choices must be non-empty strings`,
    );
  } else {
    assert(claim.value.length >= 30, `${prefix} value is too shallow`);
  }

  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(claim.as_of),
    `${prefix} must have an explicit as_of date`,
  );
  assert(
    CONFIDENCE_LEVELS.has(claim.confidence),
    `${prefix} has invalid confidence`,
  );
  assert(
    REVIEW_STATES.has(claim.review_state),
    `${prefix} has invalid review_state`,
  );
  assert(Array.isArray(claim.source_ids), `${prefix} source_ids must be an array`);

  const citedSources = claim.source_ids.map((sourceId) => {
    assert(
      sourceById.has(sourceId),
      `${prefix} cites unknown source ${sourceId}`,
    );
    return sourceById.get(sourceId);
  });

  if (claim.review_state === 'reviewed') {
    assert(citedSources.length > 0, `${prefix} reviewed claim needs a source`);
    assert(
      citedSources.every((source) => source.evidence_reviewed),
      `${prefix} reviewed claim cites unreviewed evidence`,
    );
  }

  if (topic === 'why' && claim.review_state === 'reviewed') {
    const hasAuthority = citedSources.some(
      (source) => source.source_tier === 'A',
    );
    const independenceGroups = new Set(
      citedSources.map((source) => source.independence_group),
    );
    assert(
      hasAuthority || independenceGroups.size >= 2,
      `${prefix} causal review needs an authority or two independence groups`,
    );
  }

  if (citedSources.length === 0) {
    assert(
      claim.review_state === 'unresolved',
      `${prefix} source-free claim must remain unresolved`,
    );
  }

  if (claim.confidence === 'high') {
    assert(
      claim.review_state === 'reviewed',
      `${prefix} high confidence requires reviewed evidence`,
    );
  }
}

function validateCase(caseStudy) {
  const dossierId = caseStudy.dossier_id ?? '<missing-dossier-id>';

  assert(
    /^(dex|cex):(successful|mid|dead):[a-z0-9-]+$/.test(dossierId),
    `${dossierId} has invalid dossier_id`,
  );
  assert(
    ['successful_exchanges', 'mid_exchanges', 'dead_exchanges'].includes(
      caseStudy.current_table,
    ),
    `${dossierId} has invalid current_table`,
  );
  assert(caseStudy.review?.reviewer, `${dossierId} missing reviewer`);
  assert(
    /^\d{4}-\d{2}-\d{2}T/.test(caseStudy.review?.reviewed_at ?? ''),
    `${dossierId} missing review timestamp`,
  );
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(caseStudy.review?.as_of ?? ''),
    `${dossierId} missing review as_of`,
  );
  assert(
    ['reviewed', 'partially_reviewed'].includes(caseStudy.review?.state),
    `${dossierId} has invalid case review state`,
  );

  assert(
    Array.isArray(caseStudy.sources) && caseStudy.sources.length >= 3,
    `${dossierId} needs at least three source records`,
  );
  const sourceById = new Map();
  for (const source of caseStudy.sources) {
    assert(!sourceById.has(source.id), `${dossierId} duplicates source ${source.id}`);
    sourceById.set(source.id, source);
    validateSource(source, dossierId);
  }

  assert(
    new Set(caseStudy.sources.map((source) => source.independence_group)).size >=
      2,
    `${dossierId} needs at least two independence groups`,
  );

  const claimTopics = Object.keys(caseStudy.claims ?? {});
  assert(
    JSON.stringify(claimTopics.sort()) ===
      JSON.stringify([...REQUIRED_CLAIM_TOPICS].sort()),
    `${dossierId} must map exactly the six required claim topics`,
  );
  for (const topic of REQUIRED_CLAIM_TOPICS) {
    validateClaim(caseStudy.claims[topic], topic, dossierId, sourceById);
  }

  assert(
    Array.isArray(caseStudy.counterevidence) &&
      caseStudy.counterevidence.length >= 2 &&
      caseStudy.counterevidence.every(isNonEmptyString),
    `${dossierId} needs at least two counterevidence notes`,
  );
  assert(
    Array.isArray(caseStudy.unknowns) &&
      caseStudy.unknowns.length >= 3 &&
      caseStudy.unknowns.every(isNonEmptyString),
    `${dossierId} needs at least three explicit unknowns`,
  );
}

export function validateArtifact(artifact) {
  assert(
    artifact.schema === 'chaindump-exchange-evidence-remediation-wave-b-v1',
    'Unexpected artifact schema',
  );
  assert(
    artifact.status === 'implementation-prepared-no-migration-number-assigned',
    'Wave B must remain a prep artifact until a migration number is assigned',
  );
  assert(
    artifact.selection?.dossier_count === 15,
    'Selection metadata must declare 15 dossiers',
  );
  assert(
    artifact.research_as_of === artifact.as_of,
    'research_as_of must explicitly match the canonical as_of date',
  );
  assert(
    JSON.stringify([...artifact.selection.required_claim_topics].sort()) ===
      JSON.stringify([...REQUIRED_CLAIM_TOPICS].sort()),
    'Selection metadata must declare the six required claim topics',
  );
  assert(
    Array.isArray(artifact.cases) && artifact.cases.length === 15,
    'Wave B must contain exactly 15 cases',
  );
  assert(
    isNonEmptyString(artifact.publication_boundary),
    'Publication boundary is required',
  );

  const dossierIds = new Set();
  for (const caseStudy of artifact.cases) {
    assert(
      !dossierIds.has(caseStudy.dossier_id),
      `Duplicate dossier ${caseStudy.dossier_id}`,
    );
    dossierIds.add(caseStudy.dossier_id);
    validateCase(caseStudy);
  }

  const claimCount = artifact.cases.reduce(
    (total, caseStudy) => total + Object.keys(caseStudy.claims).length,
    0,
  );
  assert(claimCount === 90, `Expected 90 mapped claims, found ${claimCount}`);

  return {
    dossiers: artifact.cases.length,
    claims: claimCount,
    sources: artifact.cases.reduce(
      (total, caseStudy) => total + caseStudy.sources.length,
      0,
    ),
    reviewed_sources: artifact.cases.reduce(
      (total, caseStudy) =>
        total +
        caseStudy.sources.filter((source) => source.evidence_reviewed).length,
      0,
    ),
    unresolved_claims: artifact.cases.reduce(
      (total, caseStudy) =>
        total +
        Object.values(caseStudy.claims).filter(
          (claim) => claim.review_state === 'unresolved',
        ).length,
      0,
    ),
  };
}

export function readArtifact() {
  return JSON.parse(readFileSync(ARTIFACT_URL, 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const summary = validateArtifact(readArtifact());
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

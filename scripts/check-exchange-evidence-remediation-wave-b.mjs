import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  evaluatePublicationClaim,
  isIsoReviewTimestamp,
  normalizePublicationSource,
} from '../src/lib/publication-depth.mjs';

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

const SOURCE_ROLES = new Set([
  'aggregator',
  'authority',
  'independent',
  'primary',
]);

const HIGH_RISK_TOPIC_TYPES = new Map([
  ['outcome', 'lifecycle'],
  ['why', 'causal'],
  ['strategic_choices', 'causal'],
  ['legal_or_loss', 'loss'],
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSemanticallyValidIsoTimestamp(value) {
  if (!isIsoReviewTimestamp(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2})))?$/.exec(
    String(value),
  );
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText,
    offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() + 1 !== month
    || calendarDate.getUTCDate() !== day
  ) return false;
  if (hourText === undefined) return true;
  return Number(hourText) <= 23
    && Number(minuteText) <= 59
    && Number(secondText) <= 59
    && Number(offsetHourText ?? 0) <= 23
    && Number(offsetMinuteText ?? 0) <= 59;
}

function isIssuerAuthored(source) {
  return /issuer/i.test([
    source.title,
    source.publisher,
    source.independence_group,
    source.evidence_locator,
  ].filter(Boolean).join(' '));
}

function policySource(source) {
  return normalizePublicationSource({
    ...source,
    resolving: ACCESSIBLE_STATES.has(source.access_state),
  });
}

function validateSource(source, dossierId, artifact) {
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
    SOURCE_ROLES.has(source.source_role),
    `${prefix} has non-semantic source_role=${source.source_role}`,
  );
  if (source.source_role === 'authority') {
    assert(
      source.source_tier === 'A',
      `${prefix} authority evidence must be tier A`,
    );
  }
  if (isIssuerAuthored(source)) {
    assert(
      source.source_role === 'primary',
      `${prefix} issuer-authored disclosure must remain primary, not authority or independent`,
    );
  }
  assert(
    source.url.startsWith('https://'),
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
      isSemanticallyValidIsoTimestamp(source.evidence_reviewed_at),
      `${prefix} reviewed evidence needs a semantically valid evidence_reviewed_at`,
    );
    assert(
      Date.parse(source.evidence_reviewed_at) <= Date.parse(artifact.reviewed_at),
      `${prefix} evidence review cannot postdate the artifact review`,
    );
    assert(
      ACCESSIBLE_STATES.has(source.access_state),
      `${prefix} cannot be reviewed with access_state=${source.access_state}`,
    );
    assert(
      source.evidence_locator.length >= 35,
      `${prefix} reviewed evidence locator is too shallow`,
    );
    const normalized = policySource(source);
    assert(
      normalized.evidence_reviewed,
      `${prefix} review metadata does not satisfy publication-depth semantics`,
    );
    assert(
      normalized.tier === {
        A: 'T1',
        B: 'T2',
        C: 'T3',
        D: 'T4',
      }[source.source_tier],
      `${prefix} tier does not normalize to publication-depth semantics`,
    );
    assert(
      normalized.role === source.source_role,
      `${prefix} role does not normalize to publication-depth semantics`,
    );
    if (source.source_role === 'authority' || source.source_role === 'independent') {
      assert(
        isNonEmptyString(normalized.independence_key),
        `${prefix} reviewed ${source.source_role} evidence needs independence identity`,
      );
    }
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

function validateClaim(claim, topic, dossierId, sourceById, policySourceById, artifact) {
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
    isSemanticallyValidIsoTimestamp(claim.as_of) && claim.as_of === artifact.as_of,
    `${prefix} must have a semantically valid canonical as_of date`,
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
    const highRiskType = HIGH_RISK_TOPIC_TYPES.get(topic);
    if (highRiskType) {
      const assessment = evaluatePublicationClaim({
        path: `claims.${topic}`,
        type: highRiskType,
        high_risk: true,
        source_refs: claim.source_ids,
      }, policySourceById);
      assert(
        assessment.passes,
        `${prefix} reviewed high-risk ${highRiskType} claim does not meet publication-depth policy: ${assessment.gaps.join(', ')}`,
      );
    }
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

function validateCase(caseStudy, artifact) {
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
    isSemanticallyValidIsoTimestamp(caseStudy.review?.reviewed_at),
    `${dossierId} missing semantically valid review timestamp`,
  );
  assert(
    isSemanticallyValidIsoTimestamp(caseStudy.review?.as_of) &&
      caseStudy.review.as_of === artifact.as_of,
    `${dossierId} missing canonical review as_of`,
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
  const policySourceById = new Map();
  for (const source of caseStudy.sources) {
    assert(!sourceById.has(source.id), `${dossierId} duplicates source ${source.id}`);
    sourceById.set(source.id, source);
    const normalized = policySource(source);
    policySourceById.set(source.id, normalized);
    policySourceById.set(source.url, normalized);
    validateSource(source, dossierId, artifact);
  }

  assert(
    new Set(caseStudy.sources.map((source) => source.independence_group)).size >=
      2,
    `${dossierId} needs at least two independence groups`,
  );

  const claimTopics = Object.keys(caseStudy.claims ?? {});
  assert(
    JSON.stringify(claimTopics.toSorted((left, right) => left.localeCompare(right))) ===
      JSON.stringify([...REQUIRED_CLAIM_TOPICS].toSorted(
        (left, right) => left.localeCompare(right),
      )),
    `${dossierId} must map exactly the six required claim topics`,
  );
  for (const topic of REQUIRED_CLAIM_TOPICS) {
    validateClaim(
      caseStudy.claims[topic],
      topic,
      dossierId,
      sourceById,
      policySourceById,
      artifact,
    );
  }
  const expectedReviewState = Object.values(caseStudy.claims).every(
    (claim) => claim.review_state === 'reviewed',
  ) ? 'reviewed' : 'partially_reviewed';
  assert(
    caseStudy.review.state === expectedReviewState,
    `${dossierId} case review.state must be ${expectedReviewState} to match claim states`,
  );

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
    isSemanticallyValidIsoTimestamp(artifact.as_of) &&
      isSemanticallyValidIsoTimestamp(artifact.research_as_of) &&
      isSemanticallyValidIsoTimestamp(artifact.reviewed_at),
    'Artifact dates and review timestamp must be semantically valid ISO values',
  );
  assert(
    JSON.stringify([...artifact.selection.required_claim_topics].toSorted(
      (left, right) => left.localeCompare(right),
    )) ===
      JSON.stringify([...REQUIRED_CLAIM_TOPICS].toSorted(
        (left, right) => left.localeCompare(right),
      )),
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
    validateCase(caseStudy, artifact);
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

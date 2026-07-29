import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const artifactUrl = new URL(
  '../docs/casino-evidence-depth-wave-b-2026-07-29.json',
  import.meta.url,
);

export const EXPECTED_DOSSIERS = new Map([
  ['bitstarz-dot-com', 8],
  ['sx-bet', 8],
  ['azuro', 7],
  ['bustabit', 7],
  ['coinpoker-dot-com', 7],
  ['duelbits-dot-com', 7],
  ['overtime', 7],
  ['winr-protocol-bankroll', 7],
  ['betfury-bfg-ecosystem', 6],
  ['betswirl-onchain-casino', 6],
]);

export const REQUIRED_CLAIM_TOPICS = [
  'outcome',
  'why',
  'strategic_choices',
  'token',
  'chain_dependence',
  'legal_or_loss',
];

const REVIEW_STATES = new Set(['reviewed', 'partially_reviewed', 'unresolved']);
const CONFIDENCE_LEVELS = new Set(['low', 'medium', 'high']);
const ACCESS_STATES = new Set(['accessible', 'blocked', 'removed', 'unknown']);
const REVIEWER = 'codex-research-agent';
const AS_OF = '2026-07-29';

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

export function readArtifact() {
  return JSON.parse(readFileSync(artifactUrl, 'utf8'));
}

export function validateArtifact(document) {
  const errors = [];
  const metrics = {
    dossiers: document.cases?.length ?? 0,
    claims: 0,
    sources: 0,
    reviewed_sources: 0,
    access_debt: 0,
    reviewed_claims: 0,
    partially_reviewed_claims: 0,
    unresolved_claims: 0,
  };

  add(
    errors,
    document.schema === 'chaindump-casino-evidence-depth-wave-b-v1',
    'unexpected schema',
  );
  add(errors, document.as_of === AS_OF, 'artifact as_of must be 2026-07-29');
  add(
    errors,
    document.research_as_of === AS_OF,
    'research_as_of must be 2026-07-29',
  );
  add(errors, document.reviewer === REVIEWER, 'artifact reviewer is missing');
  add(
    errors,
    document.status === 'implementation-prepared-no-migration-number-assigned',
    'prep status must remain blocked from migration publication',
  );
  add(
    errors,
    /no migration number/i.test(document.publication_boundary ?? '')
      && /creates no UI/i.test(document.publication_boundary ?? '')
      && /reachability alone is insufficient/i.test(document.publication_boundary ?? '')
      && /never converted into case-specific findings/i.test(document.publication_boundary ?? ''),
    'publication boundary must preserve migration/UI, review, and allegation safeguards',
  );
  add(errors, document.selection?.dossier_count === 10, 'selection must contain ten dossiers');
  add(
    errors,
    JSON.stringify(document.selection?.required_claim_topics) === JSON.stringify(REQUIRED_CLAIM_TOPICS),
    'selection claim topics do not match the evidence contract',
  );
  add(
    errors,
    JSON.stringify(document.selection?.inventory_unresolved_high_risk_claims)
      === JSON.stringify(Object.fromEntries(EXPECTED_DOSSIERS)),
    'selection does not preserve the audited unresolved-claim counts',
  );
  add(errors, Array.isArray(document.cases), 'cases must be an array');
  add(errors, document.cases?.length === 10, 'artifact must contain exactly ten dossiers');

  const seenDossiers = new Set();

  for (const dossier of document.cases ?? []) {
    const prefix = dossier.dossier_id ?? '<missing-dossier-id>';
    add(errors, EXPECTED_DOSSIERS.has(dossier.dossier_id), `${prefix}: unexpected dossier`);
    add(errors, !seenDossiers.has(dossier.dossier_id), `${prefix}: duplicate dossier`);
    seenDossiers.add(dossier.dossier_id);
    add(errors, dossier.review?.as_of === AS_OF, `${prefix}: review as_of is stale`);
    add(errors, dossier.review?.reviewer === REVIEWER, `${prefix}: reviewer is missing`);
    add(
      errors,
      typeof dossier.review?.reviewed_at === 'string'
        && !Number.isNaN(Date.parse(dossier.review.reviewed_at)),
      `${prefix}: reviewed_at is not an ISO timestamp`,
    );
    add(
      errors,
      REVIEW_STATES.has(dossier.review?.state),
      `${prefix}: invalid dossier review state`,
    );
    add(
      errors,
      Array.isArray(dossier.counterevidence) && dossier.counterevidence.length >= 2,
      `${prefix}: needs at least two counterevidence statements`,
    );
    add(
      errors,
      Array.isArray(dossier.unknowns) && dossier.unknowns.length >= 3,
      `${prefix}: needs at least three explicit unknowns`,
    );

    const sources = new Map();
    for (const source of dossier.sources ?? []) {
      metrics.sources += 1;
      add(errors, Boolean(source.id), `${prefix}: source id is missing`);
      add(errors, !sources.has(source.id), `${prefix}: duplicate source ${source.id}`);
      sources.set(source.id, source);
      add(errors, /^https:\/\//.test(source.url ?? ''), `${prefix}/${source.id}: invalid URL`);
      add(errors, /^[A-D]$/.test(source.source_tier ?? ''), `${prefix}/${source.id}: invalid tier`);
      add(errors, Boolean(source.source_role), `${prefix}/${source.id}: role is missing`);
      add(
        errors,
        Boolean(source.independence_group),
        `${prefix}/${source.id}: independence group is missing`,
      );
      add(
        errors,
        ACCESS_STATES.has(source.access_state),
        `${prefix}/${source.id}: invalid access state`,
      );
      add(
        errors,
        !Object.prototype.hasOwnProperty.call(source, 'reviewed_at'),
        `${prefix}/${source.id}: legacy-only reviewed_at is forbidden`,
      );

      if (source.evidence_reviewed === true) {
        metrics.reviewed_sources += 1;
        add(
          errors,
          source.access_state === 'accessible',
          `${prefix}/${source.id}: reviewed source must be accessible`,
        );
        add(
          errors,
          typeof source.evidence_locator === 'string' && source.evidence_locator.length >= 30,
          `${prefix}/${source.id}: reviewed source needs a field-level evidence locator`,
        );
        add(
          errors,
          source.evidence_reviewer === REVIEWER,
          `${prefix}/${source.id}: reviewed source needs reviewer attribution`,
        );
        add(
          errors,
          typeof source.evidence_reviewed_at === 'string'
            && !Number.isNaN(Date.parse(source.evidence_reviewed_at)),
          `${prefix}/${source.id}: reviewed source needs an ISO review timestamp`,
        );
      } else {
        metrics.access_debt += 1;
        add(
          errors,
          !source.evidence_reviewer && !source.evidence_reviewed_at,
          `${prefix}/${source.id}: unreviewed source cannot carry reviewer credit`,
        );
      }
    }

    const claimTopics = Object.keys(dossier.claims ?? {});
    add(
      errors,
      JSON.stringify(claimTopics) === JSON.stringify(REQUIRED_CLAIM_TOPICS),
      `${prefix}: claim topics must match the evidence contract and order`,
    );

    for (const [topic, claim] of Object.entries(dossier.claims ?? {})) {
      metrics.claims += 1;
      const claimPrefix = `${prefix}/${topic}`;
      add(errors, claim.as_of === AS_OF, `${claimPrefix}: as_of is stale`);
      add(
        errors,
        REVIEW_STATES.has(claim.review_state),
        `${claimPrefix}: invalid review_state`,
      );
      add(
        errors,
        CONFIDENCE_LEVELS.has(claim.confidence),
        `${claimPrefix}: invalid confidence`,
      );
      add(
        errors,
        Array.isArray(claim.source_ids),
        `${claimPrefix}: source_ids must be an array`,
      );
      add(
        errors,
        typeof claim.value === 'string' || Array.isArray(claim.value),
        `${claimPrefix}: value must be text or a list`,
      );

      if (claim.review_state === 'reviewed') metrics.reviewed_claims += 1;
      if (claim.review_state === 'partially_reviewed') metrics.partially_reviewed_claims += 1;
      if (claim.review_state === 'unresolved') metrics.unresolved_claims += 1;

      if (claim.confidence === 'high') {
        add(
          errors,
          claim.review_state === 'reviewed',
          `${claimPrefix}: high confidence requires reviewed state`,
        );
      }
      if ((claim.source_ids ?? []).length === 0) {
        add(
          errors,
          claim.review_state === 'unresolved',
          `${claimPrefix}: source-free claims must remain unresolved`,
        );
      }

      const referencedSources = (claim.source_ids ?? []).map((sourceId) => {
        add(
          errors,
          sources.has(sourceId),
          `${claimPrefix}: unregistered source ${sourceId}`,
        );
        return sources.get(sourceId);
      }).filter(Boolean);

      if (claim.review_state === 'reviewed') {
        add(
          errors,
          referencedSources.length > 0
            && referencedSources.every((source) => source.evidence_reviewed === true),
          `${claimPrefix}: reviewed claim requires reviewed evidence`,
        );
      }

      if (topic === 'why' && claim.review_state === 'reviewed') {
        const independenceGroups = new Set(
          referencedSources.map((source) => source.independence_group),
        );
        const hasAuthority = referencedSources.some(
          (source) => source.source_tier === 'A' || source.source_role === 'authority',
        );
        add(
          errors,
          hasAuthority || independenceGroups.size >= 2,
          `${claimPrefix}: reviewed causal claim needs authority or two independence groups`,
        );
      }
    }
  }

  add(
    errors,
    [...EXPECTED_DOSSIERS.keys()].every((dossierId) => seenDossiers.has(dossierId)),
    'one or more selected dossiers are missing',
  );
  add(errors, metrics.claims === 60, 'artifact must map exactly sixty claims');

  return { errors, metrics };
}

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`));

if (isDirectRun) {
  const result = validateArtifact(readArtifact());
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(result.metrics, null, 2));
  }
}

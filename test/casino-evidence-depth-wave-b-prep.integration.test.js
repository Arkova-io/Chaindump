import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_DOSSIERS,
  REQUIRED_CLAIM_TOPICS,
  validateArtifact,
} from '../scripts/check-casino-evidence-depth-wave-b.mjs';

const document = JSON.parse(readFileSync(
  new URL('../docs/casino-evidence-depth-wave-b-2026-07-29.json', import.meta.url),
  'utf8',
));

describe('casino evidence-depth Wave B preparation', () => {
  it('locks the audited ten-dossier selection and six-topic contract', () => {
    expect(document.cases.map((entry) => entry.dossier_id)).toEqual([
      ...EXPECTED_DOSSIERS.keys(),
    ]);
    expect(document.selection.inventory_unresolved_high_risk_claims).toEqual(
      Object.fromEntries(EXPECTED_DOSSIERS),
    );
    for (const entry of document.cases) {
      expect(Object.keys(entry.claims)).toEqual(REQUIRED_CLAIM_TOPICS);
    }
  });

  it('passes the evidence, freshness, causality, and uncertainty gate', () => {
    expect(validateArtifact(document)).toEqual({
      errors: [],
      metrics: {
        dossiers: 10,
        claims: 60,
        sources: 42,
        reviewed_sources: 42,
        access_debt: 0,
        reviewed_claims: 29,
        partially_reviewed_claims: 26,
        unresolved_claims: 5,
      },
    });
  });

  it('remains explicitly blocked from migration, runtime, and UI publication', () => {
    expect(document.status).toBe('implementation-prepared-no-migration-number-assigned');
    expect(document.publication_boundary).toContain('assigns no migration number');
    expect(document.publication_boundary).toContain('changes no runtime tables');
    expect(document.publication_boundary).toContain('creates no UI');
    expect(document.publication_boundary).toContain('URL reachability alone is insufficient');
    expect(document.publication_boundary).toContain(
      'never converted into case-specific findings',
    );
  });

  it('rejects reachability-only review credit and unsupported causal certainty', () => {
    const reachabilityOnly = structuredClone(document);
    delete reachabilityOnly.cases[0].sources[0].evidence_locator;
    expect(validateArtifact(reachabilityOnly).errors).toContain(
      'bitstarz-dot-com/bitstarz-terms-current: reviewed source needs a field-level evidence locator',
    );

    const unsupportedCausalClaim = structuredClone(document);
    unsupportedCausalClaim.cases[0].claims.why.review_state = 'reviewed';
    expect(validateArtifact(unsupportedCausalClaim).errors).toContain(
      'bitstarz-dot-com/why: reviewed causal claim needs tier-A/B independent evidence or two independent tier-C origins',
    );

    const dataIsNotAuthority = structuredClone(document);
    const betswirl = dataIsNotAuthority.cases.find(
      (entry) => entry.dossier_id === 'betswirl-onchain-casino',
    );
    betswirl.claims.why.review_state = 'reviewed';
    expect(validateArtifact(dataIsNotAuthority).errors).toContain(
      'betswirl-onchain-casino/why: reviewed causal claim needs tier-A/B independent evidence or two independent tier-C origins',
    );

    const invalidCalendarDate = structuredClone(document);
    invalidCalendarDate.cases[0].review.reviewed_at = '2026-02-31T20:30:00-04:00';
    expect(validateArtifact(invalidCalendarDate).errors).toContain(
      'bitstarz-dot-com: reviewed_at is not an ISO timestamp on the as_of date',
    );
  });

  it('rejects authority-role causality, dependent origins, and operator-only legal certainty', () => {
    const authorityAsCausality = structuredClone(document);
    authorityAsCausality.cases[0].claims.why = {
      ...authorityAsCausality.cases[0].claims.why,
      source_ids: ['bitstarz-cga-certificate'],
      review_state: 'reviewed',
    };
    expect(validateArtifact(authorityAsCausality).errors).toContain(
      'bitstarz-dot-com/why: reviewed causal claim needs tier-A/B independent evidence or two independent tier-C origins',
    );

    const dependentOrigins = structuredClone(document);
    const bitstarz = dependentOrigins.cases[0];
    for (const source of bitstarz.sources.filter(
      (entry) => ['bitstarz-terms-current', 'bitstarz-birthday-history'].includes(entry.id),
    )) {
      source.source_role = 'independent';
      source.source_tier = 'C';
      source.independence_group = 'same_editorial_origin';
    }
    bitstarz.claims.why = {
      ...bitstarz.claims.why,
      source_ids: ['bitstarz-terms-current', 'bitstarz-birthday-history'],
      review_state: 'reviewed',
    };
    expect(validateArtifact(dependentOrigins).errors).toContain(
      'bitstarz-dot-com/why: reviewed causal claim needs tier-A/B independent evidence or two independent tier-C origins',
    );

    const operatorOnlyLicence = structuredClone(document);
    const sx = operatorOnlyLicence.cases.find((entry) => entry.dossier_id === 'sx-bet');
    sx.claims.legal_or_loss.review_state = 'reviewed';
    expect(validateArtifact(operatorOnlyLicence).errors).toContain(
      'sx-bet/legal_or_loss: reviewed legal status needs a tier-A authority record',
    );
  });

  it('enforces access method, dynamic-source freshness, and review ordering', () => {
    const missingFreshness = structuredClone(document);
    const sxData = missingFreshness.cases[1].sources.find(
      (entry) => entry.id === 'sx-defillama-current',
    );
    delete sxData.freshness_note;
    expect(validateArtifact(missingFreshness).errors).toContain(
      'sx-bet/sx-defillama-current: data source needs an explicit freshness note',
    );

    const futureObservation = structuredClone(document);
    const azuroData = futureObservation.cases[2].sources.find(
      (entry) => entry.id === 'azuro-defillama-current',
    );
    azuroData.observation_as_of = '2026-07-30';
    expect(validateArtifact(futureObservation).errors).toContain(
      'azuro/azuro-defillama-current: data source needs a semantic observation_as_of no later than the artifact',
    );

    const invalidAccessMethod = structuredClone(document);
    invalidAccessMethod.cases[0].sources[0].access_method = 'url_reachable';
    expect(validateArtifact(invalidAccessMethod).errors).toContain(
      'bitstarz-dot-com/bitstarz-terms-current: invalid access method',
    );

    const reviewAfterArtifact = structuredClone(document);
    reviewAfterArtifact.cases[0].review.reviewed_at = '2026-07-29T20:31:00-04:00';
    expect(validateArtifact(reviewAfterArtifact).errors).toContain(
      'bitstarz-dot-com: dossier review cannot occur after artifact review',
    );
  });

  it('keeps allegations and jurisdiction-level criticism scoped as counterevidence', () => {
    const coinPoker = document.cases.find(
      (entry) => entry.dossier_id === 'coinpoker-dot-com',
    );
    expect(coinPoker.claims.legal_or_loss.value).toContain(
      'not a CoinPoker-specific finding',
    );
    expect(coinPoker.counterevidence.join(' ')).toContain(
      'must not be transformed into a finding',
    );

    const duelbits = document.cases.find(
      (entry) => entry.dossier_id === 'duelbits-dot-com',
    );
    expect(duelbits.claims.legal_or_loss.value).toContain(
      'stale entity and licence description',
    );
    expect(duelbits.claims.legal_or_loss.value).not.toContain('fraud');
  });
});

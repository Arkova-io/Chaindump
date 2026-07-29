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
        sources: 41,
        reviewed_sources: 41,
        access_debt: 0,
        reviewed_claims: 38,
        partially_reviewed_claims: 17,
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
      'bitstarz-dot-com/why: reviewed causal claim needs authority or two independence groups',
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

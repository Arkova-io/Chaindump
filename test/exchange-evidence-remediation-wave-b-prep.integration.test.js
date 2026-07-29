import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  ARTIFACT_URL,
  REQUIRED_CLAIM_TOPICS,
  validateArtifact,
} from '../scripts/check-exchange-evidence-remediation-wave-b.mjs';

const artifact = JSON.parse(readFileSync(ARTIFACT_URL, 'utf8'));

describe('exchange evidence remediation wave B prep', () => {
  it('maps all six forensic topics for fifteen distinct dossiers', () => {
    const summary = validateArtifact(artifact);

    expect(summary).toEqual({
      dossiers: 15,
      claims: 90,
      sources: 59,
      reviewed_sources: 54,
      unresolved_claims: 12,
    });
    expect(
      new Set(artifact.cases.map((caseStudy) => caseStudy.dossier_id)).size,
    ).toBe(15);
    for (const caseStudy of artifact.cases) {
      expect(Object.keys(caseStudy.claims).sort()).toEqual(
        [...REQUIRED_CLAIM_TOPICS].sort(),
      );
    }
  });

  it('keeps publication blocked on explicit evidence debt', () => {
    expect(artifact.status).toBe(
      'implementation-prepared-no-migration-number-assigned',
    );
    expect(artifact.publication_boundary).toContain('not a publication migration');

    const unreviewedSources = artifact.cases.flatMap((caseStudy) =>
      caseStudy.sources
        .filter((source) => !source.evidence_reviewed)
        .map((source) => ({
          dossier_id: caseStudy.dossier_id,
          access_state: source.access_state,
        })),
    );

    expect(unreviewedSources).toEqual([
      {
        dossier_id: 'dex:successful:hyperliquid',
        access_state: 'unsupported_content_type',
      },
      {
        dossier_id: 'dex:successful:meteora',
        access_state: 'fetch_failed',
      },
      {
        dossier_id: 'cex:dead:ascendex',
        access_state: 'wrong_content',
      },
      {
        dossier_id: 'cex:dead:ascendex',
        access_state: 'not_found',
      },
      {
        dossier_id: 'dex:successful:raydium',
        access_state: 'canonical_url_unverified',
      },
    ]);
  });

  it('rejects legacy-only source review metadata', () => {
    const mutated = structuredClone(artifact);
    const source = mutated.cases[0].sources[0];

    source.reviewed_at = source.evidence_reviewed_at;
    delete source.evidence_reviewer;
    delete source.evidence_reviewed_at;

    expect(() => validateArtifact(mutated)).toThrow(
      /reviewed evidence needs evidence_reviewer/,
    );
  });

  it('preserves critical allegation, scope, and solvency boundaries', () => {
    const byId = new Map(
      artifact.cases.map((caseStudy) => [caseStudy.dossier_id, caseStudy]),
    );

    expect(
      byId.get('dex:successful:meteora').claims.legal_or_loss.value,
    ).toContain('not the truth of the allegations');
    expect(
      byId.get('dex:dead:kyberswap').claims.outcome.value,
    ).toContain('surviving KyberSwap brand');
    expect(
      byId.get('cex:dead:ascendex').claims.legal_or_loss.value,
    ).toContain('not proof of a $240M loss');
    expect(
      byId.get('cex:mid:okx').counterevidence.join(' '),
    ).toContain('cannot establish consolidated solvency');
    expect(
      byId.get('dex:successful:jupiter').counterevidence.join(' '),
    ).toContain('not additive');
  });
});

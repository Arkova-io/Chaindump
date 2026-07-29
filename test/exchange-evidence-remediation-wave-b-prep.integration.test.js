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
      reviewed_sources: 55,
      unresolved_claims: 9,
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

  it('derives dossier review state from claim review state', () => {
    for (const caseStudy of artifact.cases) {
      const expected = Object.values(caseStudy.claims).every(
        (claim) => claim.review_state === 'reviewed',
      ) ? 'reviewed' : 'partially_reviewed';
      expect(caseStudy.review.state, caseStudy.dossier_id).toBe(expected);
    }

    const mutated = structuredClone(artifact);
    const partiallyReviewed = mutated.cases.find(
      (caseStudy) => caseStudy.dossier_id === 'dex:dead:platypus-finance',
    );
    partiallyReviewed.review.state = 'reviewed';
    expect(() => validateArtifact(mutated)).toThrow(
      /case review\.state must be partially_reviewed to match claim states/,
    );
  });

  it('rejects calendar-invalid review timestamps instead of accepting Date.parse rollover', () => {
    const invalidSourceReview = structuredClone(artifact);
    invalidSourceReview.cases[0].sources[0].evidence_reviewed_at =
      '2026-02-31T12:00:00Z';
    expect(() => validateArtifact(invalidSourceReview)).toThrow(
      /semantically valid evidence_reviewed_at/,
    );

    const invalidCaseReview = structuredClone(artifact);
    invalidCaseReview.cases[0].review.reviewed_at = '2026-02-31T12:00:00Z';
    expect(() => validateArtifact(invalidCaseReview)).toThrow(
      /semantically valid review timestamp/,
    );
  });

  it('uses publication-depth tier, role and independence policy for every high-risk topic', () => {
    for (const topic of [
      'outcome',
      'why',
      'strategic_choices',
      'legal_or_loss',
    ]) {
      const mutated = structuredClone(artifact);
      const hyperliquid = mutated.cases.find(
        (caseStudy) => caseStudy.dossier_id === 'dex:successful:hyperliquid',
      );
      hyperliquid.claims[topic].source_ids = ['hyperliquid-bitwise-filing'];
      hyperliquid.claims[topic].confidence = 'medium';
      hyperliquid.claims[topic].review_state = 'reviewed';
      expect(
        () => validateArtifact(mutated),
        `${topic} must not pass on a tier-C primary issuer disclosure`,
      ).toThrow(/reviewed high-risk (lifecycle|causal|loss) claim does not meet publication-depth policy/);
    }

    const distinctPublishers = structuredClone(artifact);
    const thorchain = distinctPublishers.cases.find(
      (caseStudy) => caseStudy.dossier_id === 'dex:successful:thorchain',
    );
    thorchain.claims.why.source_ids = [
      'thorchain-coindesk-2026-exploit',
      'thorchain-decrypt-thorfi',
    ];
    thorchain.claims.why.review_state = 'reviewed';
    expect(() => validateArtifact(distinctPublishers)).not.toThrow();

    const syndicated = structuredClone(distinctPublishers);
    const syndicatedThorchain = syndicated.cases.find(
      (caseStudy) => caseStudy.dossier_id === 'dex:successful:thorchain',
    );
    for (const sourceId of [
      'thorchain-coindesk-2026-exploit',
      'thorchain-decrypt-thorfi',
    ]) {
      syndicatedThorchain.sources.find(
        (source) => source.id === sourceId,
      ).independence_group = 'shared_syndicated_origin';
    }
    expect(() => validateArtifact(syndicated)).toThrow(
      /reviewed high-risk causal claim does not meet publication-depth policy/,
    );
  });

  it('never promotes issuer-authored SEC-hosted disclosure to authority evidence', () => {
    const hyperliquid = artifact.cases.find(
      (caseStudy) => caseStudy.dossier_id === 'dex:successful:hyperliquid',
    );
    const filing = hyperliquid.sources.find(
      (source) => source.id === 'hyperliquid-bitwise-filing',
    );
    expect(filing).toMatchObject({
      source_tier: 'C',
      source_role: 'primary',
      independence_group: 'bitwise_issuer_disclosure',
    });
    expect(filing.evidence_locator).toContain('SEC hosting is not an SEC finding');

    const mutated = structuredClone(artifact);
    const mutatedFiling = mutated.cases.find(
      (caseStudy) => caseStudy.dossier_id === 'dex:successful:hyperliquid',
    ).sources.find((source) => source.id === 'hyperliquid-bitwise-filing');
    mutatedFiling.source_tier = 'A';
    mutatedFiling.source_role = 'authority';
    expect(() => validateArtifact(mutated)).toThrow(
      /issuer-authored disclosure must remain primary/,
    );
  });

  it('records direct re-review of Raydium fees and the Meteora quarterly report', () => {
    const byId = new Map(
      artifact.cases.map((caseStudy) => [caseStudy.dossier_id, caseStudy]),
    );
    const raydiumFees = byId.get('dex:successful:raydium').sources.find(
      (source) => source.id === 'raydium-docs-fees',
    );
    expect(raydiumFees).toMatchObject({
      url: 'https://docs.raydium.io/ray/protocol-fees',
      access_state: 'accessible',
      access_method: 'direct_browser_review',
      evidence_reviewed: true,
    });
    expect(raydiumFees.evidence_locator).toContain(
      'share of the trading fee, not gross swap volume',
    );

    const meteoraReport = byId.get('dex:successful:meteora').sources.find(
      (source) => source.id === 'meteora-q1-2026-report',
    );
    expect(meteoraReport).toMatchObject({
      source_tier: 'D',
      source_role: 'primary',
      access_state: 'accessible',
      access_method: 'direct_pdf_text_and_visual_review',
      evidence_reviewed: true,
    });
    expect(meteoraReport.evidence_locator).toContain(
      'first-party figures',
    );
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

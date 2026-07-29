import { describe, expect, it } from 'vitest';
import { buildNftLifecycleAnalysis } from '../src/lib/nft-lifecycle-analysis.js';

function dossier({
  slug,
  status,
  chain = 'ethereum',
  confidence = 'high',
  withheld = false,
  tokenModel = false,
  accessState = 'accessible',
  inspectedAt = '2026-07-29',
  lifecycleReviewedAt = '2026-07-29',
}) {
  const sourceId = `${slug}-source`;
  return {
    slug,
    name: slug,
    chain,
    status,
    updated_at: '2026-07-29 00:00:00',
    citation: { fieldCited: true },
    freshness: {
      statusWithheld: withheld,
      reviewOverdue: false,
      statusAsOf: '2026-07-01',
      nextReviewAt: '2026-10-29',
      lastVerifiedAt: lifecycleReviewedAt,
    },
    sources: JSON.stringify([{
      id: sourceId,
      title: `${slug} source`,
      url: `https://example.com/${slug}`,
      ...(accessState ? { access_state: accessState } : {}),
      checked_at: inspectedAt,
      last_verified_at: inspectedAt,
    }]),
    profile: {
      ...(tokenModel ? { token_model: { finding: 'documented', source_ids: [sourceId] } } : {}),
      founder_engagement: 'documented',
      citation_schema: 'field-v1',
      evidence: [{ field: 'lifecycle_status', as_of: '2026-07-01', source_ids: [sourceId] }],
      forensic_analysis: {
        version: 'forensic-analysis-v1',
        outcome: {
          label: status,
          confidence,
          as_of: '2026-07-28',
          source_refs: [sourceId],
        },
        why: { confidence: 'medium', source_refs: [sourceId] },
        strategic_choices: [{ source_refs: [sourceId] }],
        counterfactual: { source_refs: [sourceId] },
        watch: [{ source_refs: [sourceId] }],
        unknowns: [{ question: 'unknown' }],
      },
    },
  };
}

describe('NFT lifecycle cohort aggregate', () => {
  it('derives cohort size and all displayed count families from the supplied rows', () => {
    const first = buildNftLifecycleAnalysis([
      dossier({ slug: 'alpha', status: 'thriving', tokenModel: true }),
      dossier({ slug: 'beta', status: 'dead', chain: 'solana' }),
    ]);
    expect(first.cohort.total).toBe(2);
    expect(first.cohort.statuses).toEqual([
      { key: 'dead', count: 1 },
      { key: 'thriving', count: 1 },
    ]);
    expect(first.coverage.token_model).toBe(1);
    expect(first.coverage.forensic_dossiers).toBe(2);
    expect(first.coverage.strategic_choices).toBe(2);
    expect(first.coverage.material_unknowns).toBe(2);
    expect(first.coverage.watch_signals).toBe(2);
    expect(first.coverage.forensic_references_ledger_matched).toBe(first.coverage.forensic_references_total);

    const expanded = buildNftLifecycleAnalysis([
      dossier({ slug: 'alpha', status: 'thriving', tokenModel: true }),
      dossier({ slug: 'beta', status: 'dead', chain: 'solana' }),
      dossier({ slug: 'gamma', status: 'unknown', chain: 'bitcoin-ordinals', withheld: true }),
    ]);
    expect(expanded.cohort.total).toBe(3);
    expect(expanded.cohort.review_states).toContainEqual({ key: 'withheld', count: 1 });
    expect(expanded.coverage.source_records).toBe(3);
    expect(expanded.coverage.distinct_source_urls).toBe(3);
  });

  it('publishes explicit inference boundaries and falsifiers', () => {
    const analysis = buildNftLifecycleAnalysis([
      dossier({ slug: 'alpha', status: 'thriving' }),
    ]);
    expect(analysis.methodology.inference_boundary).toContain('no market base rate');
    expect(analysis.limitations.join(' ')).toContain('not market success or failure rates');
    expect(analysis.limitations.join(' ')).toContain('does not classify token launch');
    expect(analysis.falsifiers).toHaveLength(4);
    expect(analysis.evidenceWindow.newest_lifecycle_status_as_of).toBe('2026-07-01');
    expect(analysis.evidenceWindow.newest_forensic_outcome_as_of).toBe('2026-07-28');
    expect(analysis.evidenceWindow.source_access_verified_through).toBe('2026-07-29');
    expect(analysis.evidenceWindow.newest_lifecycle_status_as_of)
      .not.toBe(analysis.evidenceWindow.source_access_verified_through);
    expect(analysis.coverage.source_access_states).toEqual([{ key: 'accessible', count: 1 }]);
  });

  it('does not turn inspection or dossier-review timestamps into access verification', () => {
    const analysis = buildNftLifecycleAnalysis([
      dossier({ slug: 'verified', status: 'thriving' }),
      dossier({
        slug: 'not-recorded',
        status: 'middling',
        accessState: null,
        inspectedAt: '2027-01-01',
        lifecycleReviewedAt: '2027-02-01',
      }),
    ]);
    expect(analysis.evidenceWindow.source_access_verified_through).toBe('2026-07-29');
    expect(analysis.evidenceWindow.source_inspected_through).toBe('2027-01-01');
    expect(analysis.evidenceWindow.lifecycle_reviewed_through).toBe('2027-02-01');
    expect(analysis.coverage.source_access_states).toContainEqual({
      key: 'not_recorded',
      count: 1,
    });
  });

  it('accepts the repository resolving vocabulary as explicit access evidence', () => {
    const analysis = buildNftLifecycleAnalysis([
      dossier({
        slug: 'resolving',
        status: 'thriving',
        accessState: 'resolving',
        inspectedAt: '2026-08-01',
      }),
    ]);
    expect(analysis.evidenceWindow.source_access_verified_through).toBe('2026-08-01');
    expect(analysis.coverage.source_access_states).toEqual([{
      key: 'resolving',
      count: 1,
    }]);
  });

  it('keeps the chain-chart denominator equal to the full cohort above eight labels', () => {
    const rows = Array.from({ length: 10 }, (_, index) => dossier({
      slug: `chain-${index}`,
      status: 'thriving',
      chain: `chain-${index}`,
    }));
    const analysis = buildNftLifecycleAnalysis(rows);
    expect(analysis.cohort.total).toBe(10);
    expect(analysis.cohort.chains).toHaveLength(10);
    expect(analysis.cohort.chain_chart).toHaveLength(9);
    expect(analysis.cohort.chain_chart.at(-1)).toEqual({
      key: '__other_exact_chain_labels__',
      count: 2,
      label_count: 2,
    });
    expect(analysis.cohort.chain_chart.reduce((sum, item) => sum + item.count, 0))
      .toBe(analysis.cohort.total);
  });
});

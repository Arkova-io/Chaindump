import { describe, expect, it } from 'vitest';
import {
  buildCorpusManifest,
  normalizeTrainingRecord,
  toJsonl,
} from '../src/lib/forensic-corpus-export.mjs';

describe('forensic corpus export', () => {
  it('exports supported public text with state tags and source provenance', () => {
    const record = normalizeTrainingRecord({
      slug: 'uniswap',
      kind: 'dex',
      lifecycle: 'successful',
      name: 'Uniswap',
      summary: 'Successful because distribution and liquidity compounded.',
      outlook: 'Watch fee switch and L2 distribution.',
      sources: [{ id: 's1', title: 'Source', url: 'https://example.com/source', evidence_reviewed: true }],
      publication_depth: {
        high_risk_claim_count: 1,
        passing_high_risk_claim_count: 1,
        unresolved_high_risk_claim_count: 0,
        registered_source_count: 1,
        reviewed_source_count: 1,
      },
      analysis: {
        freshness: { status: 'current', last_verified_at: '2026-07-30' },
        forensic_analysis_status: 'published',
        forensic_analysis: {
          outcome: {
            label: 'successful',
            summary: 'Outcome supported.',
            confidence: 'high',
            as_of: '2026-07-30',
          },
          why: { summary: 'Causal why supported.' },
          strategic_choices: [{ decision: 'Ship on Ethereum first', consequence: 'Inherited liquidity.' }],
          counterfactual: { summary: 'Without liquidity, adoption would likely be weaker.' },
          watch: [{ signal: 'Fee switch', implication: 'Changes holder value capture.' }],
        },
      },
    }, { vertical: 'dex', endpoint: '/api/exchange-analysis?kind=dex', extractedAt: '2026-07-30T00:00:00Z' });

    expect(record.training_eligible).toBe(true);
    expect(record.withheld).toBe(false);
    expect(record.state_tags).toContain('outcome_successful');
    expect(record.state_tags).toContain('causal_published');
    expect(record.text.why).toBe('Causal why supported.');
    expect(record.sources[0]).toMatchObject({
      title: 'Source',
      url: 'https://example.com/source',
      evidence_reviewed: true,
    });
  });

  it('does not mark unresolved high-risk material as training eligible', () => {
    const record = normalizeTrainingRecord({
      case_id: 'casino-risk',
      brand_name: 'Risky Casino',
      status: 'active',
      publication_depth: {
        unresolved_high_risk_claim_count: 2,
        high_risk_claim_count: 3,
      },
      sources: [{ title: 'Source', url: 'https://example.com/source' }],
      analysis: {
        forensic_analysis: {
          why: { publication_support: 'pending_independent_support', summary: 'Do not leak this.' },
        },
      },
    }, { vertical: 'casino' });

    expect(record.training_eligible).toBe(false);
    expect(record.withheld).toBe(true);
    expect(record.state_tags).toContain('support_pending');
    expect(record.text.why).toBeNull();
  });

  it('builds deterministic JSONL and a manifest hash', () => {
    const records = [
      normalizeTrainingRecord({ name: 'A', sources: [{ url: 'https://example.com/a' }] }, { vertical: 'blockchain' }),
      normalizeTrainingRecord({ name: 'B', sources: [{ url: 'https://example.com/b' }] }, { vertical: 'cex' }),
    ];
    const jsonl = toJsonl(records);
    const manifest = buildCorpusManifest(records, { generatedAt: '2026-07-30T00:00:00Z' });

    expect(jsonl.split('\n').filter(Boolean)).toHaveLength(2);
    expect(manifest.record_count).toBe(2);
    expect(manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.vertical_counts).toEqual({ blockchain: 1, cex: 1 });
  });

  it('normalizes live blockchain dossier coverage into corpus records', () => {
    const record = normalizeTrainingRecord({
      name: 'Ethereum',
      dossier: {
        dossierStatus: 'thriving',
        sources: [{ title: 'Ethereum docs', url: 'https://ethereum.org/en/whitepaper/' }],
        forensicAnalysis: {
          outcome: {
            label: 'thriving',
            summary: 'Canonical chain dossier outcome.',
            confidence: 'medium',
            as_of: '2026-07-30',
          },
        },
      },
    }, { vertical: 'blockchain', endpoint: '/api/chains' });

    expect(record.vertical).toBe('blockchain');
    expect(record.entity.lifecycle).toBe('thriving');
    expect(record.outcome.summary).toBe('Canonical chain dossier outcome.');
    expect(record.sources[0].url).toBe('https://ethereum.org/en/whitepaper/');
    expect(record.training_eligible).toBe(true);
  });
});

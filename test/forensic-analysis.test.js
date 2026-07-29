import { describe, expect, it, vi } from 'vitest';
import {
  FORENSIC_ANALYSIS_VERSION,
  normalizeForensicAnalysis,
  validateForensicAnalysis,
} from '../src/lib/forensic-analysis.js';

const references = {
  status: {
    url: 'https://operator.example/status',
    title: 'Operator status notice',
    publisher: 'Example operator',
  },
  strategy: 'https://regulator.example/decision',
  market: { url: 'https://research.example/market-data' },
};

function record() {
  return {
    version: FORENSIC_ANALYSIS_VERSION,
    outcome: {
      label: 'failed',
      summary: 'The venue stopped serving customers.',
      confidence: 'high',
      as_of: '2026-07-29',
      source_refs: ['status'],
    },
    why: {
      summary: 'A documented licensing gap prevented the venue from continuing in its market.',
      confidence: 'medium',
      source_refs: ['strategy', 'status'],
    },
    strategic_choices: [
      {
        decision: 'The operator continued serving the market without the required licence.',
        consequence: 'It could not continue after the licensing deadline.',
        confidence: 'medium',
        source_refs: ['strategy'],
      },
    ],
    counterfactual: {
      summary: 'Earlier licensing or an orderly market exit could have reduced disruption.',
      confidence: 'low',
      source_refs: ['strategy'],
    },
    watch: [
      {
        signal: 'A regulator publishes a final disposition.',
        implication: 'The causal assessment and outcome should be reviewed.',
        source_refs: ['https://regulator.example/notices'],
      },
    ],
    unknowns: [
      {
        question: 'Was the venue solvent when service stopped?',
        resolution_trigger: 'Audited financial statements or a court filing.',
      },
    ],
    review: {
      status: 'current',
      last_reviewed_at: '2026-07-29',
      next_review_at: '2026-10-27',
      reviewer: 'research-desk',
    },
  };
}

describe('forensic-analysis-v1', () => {
  it('normalizes resolver-backed IDs and direct URLs without mutating the input', () => {
    const input = record();
    const original = structuredClone(input);
    const resolveRef = vi.fn((ref) => references[ref]);

    const result = normalizeForensicAnalysis(input, { resolveRef });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.withheld_sections).toEqual([]);
    expect(result.value.outcome.source_refs).toEqual([{
      ref: 'status',
      url: 'https://operator.example/status',
      title: 'Operator status notice',
      publisher: 'Example operator',
    }]);
    expect(result.value.watch[0].source_refs).toEqual([{
      url: 'https://regulator.example/notices',
    }]);
    expect(resolveRef).not.toHaveBeenCalledWith(
      'https://regulator.example/notices',
      expect.anything(),
    );
    expect(input).toEqual(original);
  });

  it('accepts a reference map as the resolver', () => {
    const result = validateForensicAnalysis(record(), { resolver: references });

    expect(result).toEqual({
      errors: [],
      warnings: [],
      withheld_sections: [],
    });
  });

  it.each([
    ['why', (input) => { input.why.source_refs = []; }],
    ['strategic_choices', (input) => { input.strategic_choices[0].source_refs = []; }],
    ['counterfactual', (input) => { input.counterfactual.source_refs = ['missing']; }],
  ])('withholds unsupported causal section %s', (section, alter) => {
    const input = record();
    alter(input);

    const result = normalizeForensicAnalysis(input, { resolver: references });

    expect(result.withheld_sections).toContain(section);
    expect(result.warnings).toContain(
      `${section}: withheld because causal support is incomplete`,
    );
    expect(result.value[section]).toEqual(section === 'strategic_choices' ? [] : null);
    expect(result.errors.some((error) => error.startsWith(`${section}`))).toBe(true);
    expect(result.value.outcome.label).toBe('failed');
  });

  it('withholds the whole strategic-choice section when any choice is unsupported', () => {
    const input = record();
    input.strategic_choices.push({
      decision: 'The operator added a new product.',
      consequence: 'Its effect is not evidenced.',
      confidence: 'low',
      source_refs: [],
    });

    const result = normalizeForensicAnalysis(input, { resolver: references });

    expect(result.value.strategic_choices).toEqual([]);
    expect(result.withheld_sections).toEqual(['strategic_choices']);
  });

  it('rejects invalid outcome, review, watch, unknown, and reference fields', () => {
    const input = record();
    input.version = 'v0';
    input.outcome.label = 'winner';
    input.outcome.as_of = 'today';
    input.outcome.confidence = 'certain';
    input.watch[0].source_refs = ['http://insecure.example'];
    input.unknowns = [];
    input.review.status = 'fresh';
    input.review.next_review_at = '2026-01-01';

    const result = validateForensicAnalysis(input, { resolver: references });

    expect(result.errors).toEqual(expect.arrayContaining([
      'version: expected forensic-analysis-v1',
      'outcome.label: invalid outcome winner',
      'outcome.confidence: expected high, medium, low, or unknown',
      'outcome.as_of: expected YYYY-MM-DD',
      'watch[0].source_refs[0]: unresolved reference',
      'watch[0].source_refs: at least one resolving evidence reference is required',
      'unknowns: at least one explicit unknown is required',
      'review.status: expected current, review_due, or needs_review',
      'review.next_review_at: cannot precede last_reviewed_at',
    ]));
  });

  it('fails closed when a resolver throws', () => {
    const result = normalizeForensicAnalysis(record(), {
      resolveRef: () => {
        throw new Error('resolver unavailable');
      },
    });

    expect(result.value.why).toBeNull();
    expect(result.value.strategic_choices).toEqual([]);
    expect(result.value.counterfactual).toBeNull();
    expect(result.errors).toContain('outcome.source_refs[0]: unresolved reference');
    expect(result.withheld_sections).toEqual([
      'why',
      'strategic_choices',
      'counterfactual',
    ]);
  });

  it('rejects non-object input without throwing', () => {
    expect(normalizeForensicAnalysis(null)).toEqual({
      value: null,
      errors: ['analysis: object required'],
      warnings: [],
      withheld_sections: ['why', 'strategic_choices', 'counterfactual'],
    });
  });
});

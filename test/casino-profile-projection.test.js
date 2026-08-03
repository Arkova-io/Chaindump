import { describe, expect, it } from 'vitest';
import { projectCasinoProfile } from '../src/lib/casino-profile-projection.js';

const sources = [
  { id: 'source:official', url: 'https://example.com/official' },
  { id: 'source:independent', url: 'https://example.com/report' },
];

const claims = [
  {
    id: 'claim:identity',
    claim_type: 'identity',
    field_path: 'identity.scope',
    source_ids: ['source:official'],
  },
  {
    id: 'claim:record',
    claim_type: 'record',
    field_path: 'record.present_situation',
    source_ids: ['source:independent'],
  },
  {
    id: 'claim:status',
    claim_type: 'status',
    field_path: 'status.operating_state',
    source_ids: ['source:official'],
  },
];

function completeInput() {
  return {
    slug: 'example-casino',
    caseRow: {
      product_scope_note: 'A peer-to-peer event market.',
      status: 'active',
      status_as_of: '2026-08-03',
    },
    synthesis: {
      source_claim_ids: ['claim:record'],
      present_situation: 'The product remains available.',
      business_mechanism: 'Users trade with one another through an order book.',
      chain_dependence: 'Positions settle on a public chain.',
      token_contribution: 'Outcome tokens represent positions, not ownership.',
      risk_legal_posture: 'Availability depends on jurisdiction and market rules.',
      outlook: {
        forensic_analysis: {
          why: {
            summary: 'Broad markets and a usable product attracted repeat activity.',
            source_refs: ['https://example.com/report'],
          },
          strategic_choices: [{
            decision: 'The operator chose peer-to-peer trading.',
            consequence: 'Its main job became matching and settlement rather than taking house risk.',
            source_refs: ['source:official'],
          }],
          counterfactual: {
            summary: 'A house-banked model would have changed both risk and economics.',
            source_refs: ['source:official'],
          },
          unknowns: ['Audited profitability is not public'],
          watch: [{
            signal: 'Watch repeat volume and executable depth.',
            implication: 'Both help separate durable activity from short-lived promotion.',
            source_refs: ['source:independent'],
          }],
          outcome: {
            summary: 'The product is operating.',
            source_refs: ['source:official'],
          },
        },
      },
    },
    sources,
    claims,
    events: [{
      event_date: '2022-01-03',
      description: 'A regulator required the operator to wind down noncompliant markets.',
      source_claim_ids: ['claim:record'],
    }],
    asOf: '2026-08-03',
  };
}

describe('citation-bounded casino profile projection', () => {
  it('maps explicit supported fields into all ten shared report sections', () => {
    const result = projectCasinoProfile(completeInput());

    expect(Object.keys(result.sections)).toEqual([
      'what_it_is',
      'what_happened',
      'why_this_outcome',
      'strategic_choices',
      'operating_model',
      'token_and_value_capture',
      'counterfactual',
      'risks_and_unknowns',
      'lifecycle',
      'outlook_and_watch',
    ]);
    expect(result.supported_section_count).toBe(10);
    expect(result.claims.every((claim) => claim.review.state === 'pending')).toBe(true);
    expect(result.outcome_claim_ids).toHaveLength(1);
    expect(result.claims.some(({ id }) => id === result.outcome_claim_ids[0])).toBe(true);
    for (const [section, body] of Object.entries(result.sections)) {
      expect(body, section).not.toContain('[object Object]');
      expect(result.section_claim_ids[section].length, section).toBeGreaterThan(0);
    }
  });

  it('withholds prose when its source references do not resolve', () => {
    const result = projectCasinoProfile({
      slug: 'sparse-casino',
      caseRow: {
        product_scope_note: 'Unsupported product description.',
        status: 'active',
        status_as_of: '2026-08-03',
      },
      synthesis: {
        present_situation: 'Unsupported current-state claim.',
        business_mechanism: 'Unsupported business model.',
        outlook: {
          forensic_analysis: {
            why: {
              summary: 'Plausible but uncited causal claim.',
              source_refs: ['https://unknown.example/source'],
            },
            outcome: {
              summary: 'Unsupported classification.',
              source_refs: ['missing-source'],
            },
          },
        },
      },
      sources,
      claims: [],
      events: [],
      asOf: '2026-08-03',
    });

    expect(result.sections).toEqual({});
    expect(result.claims).toEqual([]);
    expect(result.status_claim_ids).toEqual([]);
    expect(result.outcome_claim_ids).toEqual([]);
    expect(result.supported_section_count).toBe(0);
  });
});

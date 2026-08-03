import { describe, it, expect } from 'vitest';
import {
  PROMOTABLE,
  REVIEW_REQUIRED_PROPOSAL_DATASETS,
  promotionPlan,
  proposalNeedsHumanReview,
  researchCandidateSlug,
  validateResearchCandidateProposal,
} from '../src/lib/desk-promote.js';

// Promoting a reviewed proposal into a live table must be injection-safe:
// table + column names come ONLY from a fixed per-dataset whitelist; every
// value is bound. JSON columns are stringified; the primary key is required.
describe('promotionPlan', () => {
  it('builds a scam_intel plan, defaults slug from the proposal, stringifies JSON cols', () => {
    const plan = promotionPlan(
      'scam_intel',
      'ronin-2022',
      { name: 'Ronin', category: 'bridge hack', approx_loss_usd: 625e6, sources: [{ title: 'x', url: 'https://x' }] },
      null,
    );
    expect(plan.table).toBe('scam_intel');
    expect(plan.pk).toBe('slug');
    // slug defaulted from the proposal slug
    const i = plan.columns.indexOf('slug');
    expect(plan.values[i]).toBe('ronin-2022');
    // sources (a JSON column) stringified
    const s = plan.columns.indexOf('sources');
    expect(typeof plan.values[s]).toBe('string');
    expect(JSON.parse(plan.values[s])[0].url).toBe('https://x');
  });

  it('drops keys that are not whitelisted columns', () => {
    const plan = promotionPlan('scam_intel', 'x', { name: 'ok', evil: "'; DROP TABLE scam_intel;--", nope: 1 }, null);
    expect(plan.columns).not.toContain('evil');
    expect(plan.columns).not.toContain('nope');
    expect(plan.columns).toContain('name');
  });

  it('uses proposal sources when the payload omits them', () => {
    const plan = promotionPlan('scam_intel', 'x', { name: 'ok' }, [{ title: 't', url: 'https://u' }]);
    const s = plan.columns.indexOf('sources');
    expect(s).toBeGreaterThan(-1);
    expect(JSON.parse(plan.values[s])[0].url).toBe('https://u');
  });

  it('dead_chains keys on chain (not slug) and requires it', () => {
    const ok = promotionPlan('dead_chains', 'ignored', { chain: 'Foo', peak_tvl: 100, verdict: 'dead' }, null);
    expect(ok.pk).toBe('chain');
    expect(ok.columns).toContain('chain');
    expect(() => promotionPlan('dead_chains', 'ignored', { peak_tvl: 100 }, null)).toThrow(/primary key|chain/i);
  });

  it('throws on an unknown / non-promotable dataset', () => {
    expect(() => promotionPlan('desk_log', 'x', { a: 1 }, null)).toThrow(/promotable/i);
    expect(() => promotionPlan('bogus', 'x', { a: 1 }, null)).toThrow(/promotable/i);
  });

  it('throws when there is nothing usable beyond the PK', () => {
    expect(() => promotionPlan('scam_intel', 'x', {}, null)).toThrow(/no usable/i);
  });

  it('every whitelisted column is a real column (guards typos)', () => {
    // sanity: known datasets present
    expect(Object.keys(PROMOTABLE).sort()).toEqual(['dead_chains', 'mid_chains', 'risk_signals', 'scam_intel']);
  });

  it('keeps complex forensic evidence candidates review-only and non-promotable', () => {
    expect(REVIEW_REQUIRED_PROPOSAL_DATASETS).toEqual([
      'blockchain_analysis_candidate',
      'exchange_analysis_candidate',
      'casino_analysis_candidate',
      'nft_lifecycle_candidate',
      'entity_analysis_candidate',
    ]);
    for (const dataset of REVIEW_REQUIRED_PROPOSAL_DATASETS) {
      expect(PROMOTABLE[dataset]).toBeUndefined();
      expect(proposalNeedsHumanReview(dataset, false, 1)).toBe(true);
      expect(() => promotionPlan(dataset, 'candidate', { field: 'status' }, null)).toThrow(/not promotable/i);
    }
  });

  it('preserves the base confidence and attribution review gate', () => {
    expect(proposalNeedsHumanReview('dead_chains', false, 0.9)).toBe(false);
    expect(proposalNeedsHumanReview('dead_chains', true, 0.9)).toBe(true);
    expect(proposalNeedsHumanReview('dead_chains', false, 0.2)).toBe(true);
    expect(proposalNeedsHumanReview('dead_chains', false, NaN)).toBe(true);
  });
});

describe('research candidate evidence contract', () => {
  const payload = {
    entity_id: 'Quantum Cats',
    field_path: 'lifecycle.status',
    claim: 'The current lifecycle state requires review.',
    as_of: '2026-07-29',
    source_refs: ['portal'],
  };
  const sources = [{
    id: 'portal',
    title: 'Taproot Wizards portal',
    url: 'https://example.com/quantum-cats',
    source_type: 'primary',
    verified_at: '2026-07-29T18:00:00.000Z',
    verification_result: 'resolved',
  }];

  it('derives one deterministic dedupe key per entity, field, and as-of date', () => {
    expect(researchCandidateSlug(payload)).toBe('quantum-cats--lifecycle-status--2026-07-29');
  });

  it('accepts only citations explicitly referenced by the proposed claim', () => {
    expect(validateResearchCandidateProposal(
      'nft_lifecycle_candidate',
      researchCandidateSlug(payload),
      payload,
      sources,
    )).toMatchObject({ ok: true, canonicalSlug: 'quantum-cats--lifecycle-status--2026-07-29' });

    const invalid = validateResearchCandidateProposal(
      'nft_lifecycle_candidate',
      researchCandidateSlug(payload),
      { ...payload, source_refs: ['missing'] },
      sources,
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(' ')).toMatch(/missing/i);
  });

  it('requires a timezone-qualified verification timestamp', () => {
    const slug = researchCandidateSlug(payload);
    expect(validateResearchCandidateProposal(
      'nft_lifecycle_candidate',
      slug,
      payload,
      [{ ...sources[0], verified_at: '2026-07-29T18:00:00-04:00' }],
    ).ok).toBe(true);

    const invalid = validateResearchCandidateProposal(
      'nft_lifecycle_candidate',
      slug,
      payload,
      [{ ...sources[0], verified_at: '2026-07-29T18:00:00' }],
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(' ')).toMatch(/timezone/i);
  });

  it('limits generic entity candidates to canonical newer-vertical identifiers', () => {
    const genericPayload = {
      ...payload,
      entity_id: 'stablecoin:usdc',
      field_path: 'analysis.sections.outlook_and_watch',
    };
    const slug = researchCandidateSlug(genericPayload);
    expect(validateResearchCandidateProposal(
      'entity_analysis_candidate',
      slug,
      genericPayload,
      sources,
    ).ok).toBe(true);

    const invalidPayload = { ...genericPayload, entity_id: 'blockchain:ethereum' };
    const invalid = validateResearchCandidateProposal(
      'entity_analysis_candidate',
      researchCandidateSlug(invalidPayload),
      invalidPayload,
      sources,
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(' ')).toMatch(/canonical newer-vertical type/i);
  });
});

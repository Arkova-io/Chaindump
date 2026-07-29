import { describe, expect, it } from 'vitest';
import { forensicFreshness, validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';

const currentSource = {
  id: 'operator-current',
  source_date: '2026-06-01',
  source_date_kind: 'published',
  last_verified_at: '2026-07-29',
  evidence_scope: 'current_state',
  stale_after: '2026-09-01',
  stale: false,
};

function record(overrides = {}) {
  return {
    status: 'thriving',
    profile: {
      evidence_policy: {
        schema: 'forensic-freshness-v1',
        status_basis: 'direct_current',
        status_as_of: '2026-06-01',
        last_verified_at: '2026-07-29',
        next_review_at: '2026-09-01',
        stale: false,
      },
      evidence: [{
        field: 'lifecycle_status',
        value: 'thriving',
        as_of: '2026-06-01',
        source_ids: ['operator-current'],
      }],
    },
    sources: [currentSource],
    ...overrides,
  };
}

describe('universal forensic evidence freshness', () => {
  it('accepts non-stale direct current-state evidence', () => {
    expect(validateForensicFreshness(record())).toEqual({ valid: true, errors: [] });
  });

  it('rejects a live status backed by a stale source', () => {
    const stale = structuredClone(record());
    stale.sources[0].last_verified_at = '2026-10-01';
    stale.sources[0].stale = true;
    expect(validateForensicFreshness(stale).valid).toBe(false);
  });

  it('requires stale evidence to publish an unknown status', () => {
    const withheld = structuredClone(record());
    withheld.status = 'unknown';
    withheld.profile.evidence_policy.status_basis = 'withheld';
    withheld.profile.evidence_policy.stale = true;
    expect(validateForensicFreshness(withheld)).toEqual({ valid: true, errors: [] });
  });

  it('rejects evidence and access dates that collapse into one timestamp', () => {
    const sameDate = structuredClone(record());
    sameDate.profile.evidence_policy.status_as_of = '2026-07-29';
    sameDate.profile.evidence[0].as_of = '2026-07-29';
    expect(validateForensicFreshness(sameDate).valid).toBe(false);
  });

  it('dynamically withholds a direct status after its next review date', () => {
    expect(forensicFreshness(record().profile, '2026-09-02')).toMatchObject({
      stale: true,
      reviewOverdue: true,
      statusWithheld: true,
    });
  });
});

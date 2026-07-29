import { describe, expect, it } from 'vitest';
import { fieldEvidence, validateFieldCitedNft } from '../src/lib/nft-citation.mjs';

const sources = [{ id: 'operator', title: 'Operator record', url: 'https://example.org/record' }];
const profile = {
  citation_schema: 'field-v1',
  evidence: [
    { field: 'launch', value: '2024-01', as_of: '2026-07-29', basis: 'operator', source_ids: ['operator'] },
    { field: 'supply_or_mint', value: '1,000 items', as_of: '2026-07-29', basis: 'onchain', source_ids: ['operator'] },
    { field: 'lifecycle_status', value: 'middling', as_of: '2026-07-29', basis: 'analyst', source_ids: ['operator'] },
  ],
};

describe('NFT field-level citation contract', () => {
  it('accepts an evidence record with dated, resolvable sources', () => {
    expect(validateFieldCitedNft(profile, sources)).toEqual({ valid: true, errors: [] });
    expect(fieldEvidence(profile, sources)[0].sources[0].title).toBe('Operator record');
  });

  it('rejects a source-less lifecycle claim', () => {
    const bad = structuredClone(profile);
    bad.evidence[2].source_ids = [];
    const result = validateFieldCitedNft(bad, sources);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Evidence lifecycle_status needs at least one source');
  });

  it('rejects a rendered narrative field that has no matching evidence row', () => {
    const bad = structuredClone(profile);
    bad.analysis = 'Visible but uncited narrative.';
    const result = validateFieldCitedNft(bad, sources);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Rendered profile field analysis needs analysis evidence');
  });

  it('does not retroactively call legacy records field-cited', () => {
    expect(validateFieldCitedNft({ name: 'Legacy record' }, [])).toEqual({ valid: true, errors: [] });
  });
});

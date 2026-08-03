import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectFieldCitedNftProfile } from '../src/lib/nft-profile-projection.js';

const azukiDocument = JSON.parse(readFileSync(
  new URL('../docs/nft-legacy-depth-wave-2026-07-29.json', import.meta.url),
  'utf8',
));
const azuki = azukiDocument.dossiers.find(({ slug }) => slug === 'azuki');

const SECTION_KEYS = [
  'what_it_is', 'what_happened', 'why_this_outcome', 'strategic_choices',
  'operating_model', 'token_and_value_capture', 'counterfactual',
  'risks_and_unknowns', 'lifecycle', 'outlook_and_watch',
];

describe('field-cited NFT canonical profile projection', () => {
  it('retains the rich Azuki dossier across all ten shared sections', () => {
    const projection = projectFieldCitedNftProfile({
      slug: azuki.slug,
      profile: azuki.profile_patch,
      sources: azuki.sources,
      asOf: azukiDocument.research_as_of,
    });

    expect(Object.keys(projection.sections)).toEqual(SECTION_KEYS);
    expect(projection.sections.what_happened).toContain('Elementals');
    expect(projection.sections.why_this_outcome).toContain('trust deficit');
    expect(projection.sections.strategic_choices).toContain('physical TCG');
    expect(projection.sections.operating_model).toContain('Products:');
    expect(projection.sections.token_and_value_capture).toContain('10 billion');
    expect(projection.sections.counterfactual).toContain('smaller or staged Elementals');
    expect(projection.sections.risks_and_unknowns).toContain('Still unknown:');
    expect(projection.sections.lifecycle).toContain('genuine operating recovery');
    expect(projection.sections.outlook_and_watch).toContain('TCG sell-through');

    const sourceIds = new Set(azuki.sources.map(({ id }) => id));
    expect(projection.claims).toHaveLength(34);
    expect(projection.retain_rich_depth).toBe(true);
    expect(projection.claims.every(({ review }) => review.state === 'pending')).toBe(true);
    expect(projection.claims.every(({ source_ids: refs }) => (
      refs.length > 0 && refs.every((id) => sourceIds.has(id))
    ))).toBe(true);
    for (const key of SECTION_KEYS) {
      expect(projection.section_claim_ids[key].length, key).toBeGreaterThan(0);
      expect(projection.section_dates[key], key).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
    }
  });

  it('keeps sparse controls sparse and withholds unresolved references', () => {
    const projection = projectFieldCitedNftProfile({
      slug: 'quantum-cats',
      profile: {
        citation_schema: 'field-v1',
        evidence: [
          {
            field: 'launch', value: 'Launched in 2024', as_of: '2024-01-01',
            source_ids: ['qc-launch'],
          },
        ],
        analysis: null,
      },
      structuredProfile: {
        citation_schema: 'field-v1',
        evidence: [
          {
            field: 'launch', value: 'Launched in 2024', as_of: '2024-01-01',
            source_ids: ['qc-launch'],
          },
          {
            field: 'lifecycle_status', value: 'Middling', as_of: '2026-07-29',
            source_ids: ['missing-market-source'],
          },
        ],
        analysis: 'A market conclusion that has no resolved evidence reference.',
        why: {
          finding: 'A causal conclusion without a registered source.',
          source_ids: ['missing-market-source'],
        },
      },
      sources: [{ id: 'qc-launch', title: 'Launch', url: 'https://example.com/launch' }],
      asOf: '2026-07-29',
    });

    expect(projection.sections).toEqual({ what_it_is: 'Launched in 2024.' });
    expect(projection.section_claim_ids).toEqual({
      what_it_is: ['nft:quantum-cats:profile-evidence-launch'],
    });
    expect(projection.claims).toHaveLength(1);
    expect(projection.retain_rich_depth).toBe(false);
    expect(JSON.stringify(projection)).not.toContain('market conclusion');
    expect(JSON.stringify(projection)).not.toContain('causal conclusion');
  });
});

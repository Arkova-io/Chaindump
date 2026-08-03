import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_SECTION_KEYS,
  buildLegacyEntityProfile,
  embeddedCanonicalEntityProfile,
  ENTITY_PROFILE_SCHEMA,
  ENTITY_PROFILE_VERSION,
  profileSummary,
  scaffoldEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';

function publishedStablecoinProfile() {
  const profile = scaffoldEntityProfile({
    id: 'stablecoin:usdc',
    type: 'stablecoin',
    slug: 'usdc',
    name: 'USD Coin',
  });
  profile.analysis.sections.what_it_is = {
    body: 'USD Coin is a fiat-backed stablecoin issued by Circle.',
    as_of: '2026-08-03',
    claim_ids: ['claim:usdc:identity'],
  };
  profile.metrics = [{
    id: 'metric:usdc:supply:2026-08-03',
    dimension: 'circulating_supply',
    label: 'Circulating supply',
    value: 65_000_000_000,
    unit: 'usd',
    currency: 'USD',
    window: { start: null, end: '2026-08-03', definition: 'point_in_time' },
    as_of: '2026-08-03',
    method: 'observed',
    scope: { product: 'usdc', chains: [] },
    formula: null,
    raw_input_ids: [],
    claim_ids: ['claim:usdc:supply'],
    quality_flags: [],
  }];
  profile.sources = [{
    id: 'source:circle:transparency',
    title: 'USDC transparency',
    url: 'https://www.circle.com/transparency',
    publisher: 'Circle',
    published_at: null,
    accessed_at: '2026-08-03T14:00:00Z',
    archive_url: null,
    tier: 'B',
    role: 'primary',
    access_state: 'reachable',
    checked_at: '2026-08-03T14:00:00Z',
    content_hash: null,
  }];
  profile.claims = [
    {
      id: 'claim:usdc:identity',
      field_path: 'analysis.sections.what_it_is.body',
      source_ids: ['source:circle:transparency'],
      evidence_locator: 'USDC overview',
      support_direction: 'supports',
      note: null,
      review: {
        state: 'reviewed',
        reviewer: 'human-editor',
        reviewed_at: '2026-08-03T14:05:00Z',
      },
    },
    {
      id: 'claim:usdc:supply',
      field_path: 'metrics[metric:usdc:supply:2026-08-03].value',
      source_ids: ['source:circle:transparency'],
      evidence_locator: 'USDC in circulation',
      support_direction: 'supports',
      note: null,
      review: {
        state: 'reviewed',
        reviewer: 'human-editor',
        reviewed_at: '2026-08-03T14:05:00Z',
      },
    },
  ];
  profile.freshness = {
    state: 'current',
    last_reviewed_at: '2026-08-03T14:05:00Z',
    next_review_at: '2026-09-03T14:05:00Z',
    field_reviews: [],
  };
  profile.quality = {
    publication_state: 'published',
    completeness_pct: 90,
    confidence: 'medium',
    unsourced_fields: [],
  };
  return profile;
}

describe('canonical entity profile v1', () => {
  it('scaffolds explicit nulls without inventing identity, status, analysis, or copy', () => {
    const profile = scaffoldEntityProfile({ type: 'blockchain' });

    expect(profile.schema).toBe(ENTITY_PROFILE_SCHEMA);
    expect(profile.version).toBe(ENTITY_PROFILE_VERSION);
    expect(profile.identity).toEqual({
      id: null,
      type: 'blockchain',
      slug: null,
      name: null,
      aliases: [],
    });
    expect(profile.status.operating_state).toBeNull();
    expect(profile.outcome.label).toBeNull();
    expect(Object.keys(profile.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
    expect(profile.analysis.sections.what_it_is).toEqual({
      body: null,
      as_of: null,
      claim_ids: [],
    });
  });

  it('accepts a cited, current, category-valid published profile', () => {
    const profile = publishedStablecoinProfile();

    expect(validateEntityProfile(profile, {
      forPublication: true,
      now: new Date('2026-08-03T15:00:00Z'),
    })).toEqual([]);
  });

  it('rejects invented defaults and unknown top-level fields instead of coercing them', () => {
    const profile = scaffoldEntityProfile({
      type: 'stablecoin',
      slug: 'unknown',
      name: 'Unnamed case',
    });
    profile.robot_copy = 'same report template across every research category';

    const errors = validateEntityProfile(profile);

    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'identity.id', code: 'required' }),
      expect.objectContaining({ path: 'identity.name', code: 'placeholder' }),
      expect.objectContaining({ path: 'robot_copy', code: 'unknown_field' }),
    ]));
  });

  it('rejects category-incompatible metrics and uncited prose', () => {
    const profile = publishedStablecoinProfile();
    profile.analysis.sections.why_this_outcome = {
      body: 'Demand grew because users trusted the reserves.',
      as_of: '2026-08-03',
      claim_ids: [],
    };
    profile.metrics[0].dimension = 'tvl';

    const errors = validateEntityProfile(profile, {
      forPublication: true,
      now: new Date('2026-08-03T15:00:00Z'),
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'analysis.sections.why_this_outcome.claim_ids',
        code: 'citation_required',
      }),
      expect.objectContaining({
        path: 'metrics[0].dimension',
        code: 'unsupported_metric',
      }),
    ]));
  });

  it('will not publish stale profiles or claims whose evidence was not reviewed', () => {
    const profile = publishedStablecoinProfile();
    profile.freshness.next_review_at = '2026-08-02T14:05:00Z';
    profile.claims[0].review = {
      state: 'pending',
      reviewer: null,
      reviewed_at: null,
    };

    const errors = validateEntityProfile(profile, {
      forPublication: true,
      now: new Date('2026-08-03T15:00:00Z'),
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'freshness.next_review_at', code: 'review_overdue' }),
      expect.objectContaining({
        path: 'analysis.sections.what_it_is.claim_ids',
        code: 'reviewed_support_required',
      }),
    ]));
  });

  it('builds a card/list summary without leaking analysis or raw source ledgers', () => {
    const profile = publishedStablecoinProfile();

    const summary = profileSummary(profile);

    expect(summary).toEqual({
      schema: ENTITY_PROFILE_SCHEMA,
      version: ENTITY_PROFILE_VERSION,
      identity: profile.identity,
      classification: profile.classification,
      status: profile.status,
      outcome: profile.outcome,
      headline_metrics: profile.metrics,
      freshness: profile.freshness,
      quality: profile.quality,
    });
    expect(summary).not.toHaveProperty('analysis');
    expect(summary).not.toHaveProperty('sources');
    expect(summary).not.toHaveProperty('claims');
  });

  it('keeps legacy objects out of prose and records them as unmapped migration gaps', () => {
    const profile = buildLegacyEntityProfile({
      identity: {
        id: 'blockchain:ethereum',
        type: 'blockchain',
        slug: 'ethereum',
        name: 'Ethereum',
      },
      as_of: '2026-07-29',
      sections: {
        what_it_is: 'A smart-contract settlement network.',
        outlook_and_watch: {
          bull: 'Settlement demand expands.',
          base: 'Rollup-centric growth continues.',
        },
      },
      sources: [{
        title: 'Roadmap',
        url: 'https://ethereum.org/roadmap/',
        tier: 'first-party',
        role: 'official',
      }],
      extensions: { legacy_origin: 'chain_facts' },
    });

    expect(profile.analysis.sections.what_it_is.body).toBe('A smart-contract settlement network.');
    expect(profile.analysis.sections.outlook_and_watch.body).toBeNull();
    expect(profile.extensions.legacy_unmapped.outlook_and_watch).toEqual({
      bull: 'Settlement demand expands.',
      base: 'Rollup-centric growth continues.',
    });
    expect(JSON.stringify(profile.analysis)).not.toContain('title');
    expect(profile.sources[0]).toMatchObject({ tier: 'unknown', role: 'unknown' });
    expect(profile.quality.publication_state).toBe('review');
    expect(profile.quality.validation_errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'analysis.sections.what_it_is.claim_ids',
        code: 'citation_required',
      }),
    ]));
  });

  it('selects only identity-matched canonical profiles embedded in legacy rows', () => {
    const canonical = publishedStablecoinProfile();
    const legacy = JSON.stringify({ canonical_profile: canonical, preserved: 'legacy field' });

    expect(embeddedCanonicalEntityProfile(legacy, {
      type: 'stablecoin',
      slug: 'usdc',
    })).toEqual(canonical);
    expect(embeddedCanonicalEntityProfile(legacy, {
      type: 'stablecoin',
      slug: 'usdt',
    })).toBeNull();
    expect(embeddedCanonicalEntityProfile('{bad json', {
      type: 'stablecoin',
      slug: 'usdc',
    })).toBeNull();
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { buildProfileAdapterCensus } from '../scripts/profile-adapter-census.mjs';

const EXPECTED_COUNTS = {
  blockchain: [90, 0, 0, 90, 0, 90, 2631],
  dex: [29, 0, 27, 0, 2, 27, 92],
  cex: [30, 0, 27, 1, 2, 28, 46],
  nft_collection: [39, 0, 20, 0, 19, 0, 0],
  ordinals_collection: [12, 0, 7, 0, 5, 0, 0],
  web3_casino: [29, 0, 29, 0, 0, 10, 11],
  stablecoin: [42, 0, 0, 40, 2, 40, 645],
  rwa: [10, 0, 0, 8, 2, 8, 138],
  depin: [8, 0, 0, 8, 0, 8, 144],
  infrastructure_network: [15, 0, 0, 15, 0, 15, 191],
  crypto_treasury: [10, 0, 0, 10, 0, 10, 176],
  miner: [8, 0, 0, 8, 0, 8, 104],
  etf: [7, 0, 0, 7, 0, 7, 91],
};

const RICHEST_CONTROLS = {
  blockchain: ['ethereum', 6],
  dex: ['sushiswap', 10],
  cex: ['binance', 10],
  nft_collection: ['azuki', 10],
  ordinals_collection: ['quantum-cats', 10],
  web3_casino: ['azuro', 1],
  stablecoin: ['usdt', 10],
  rwa: ['ondo-finance', 10],
  depin: ['geodnet', 5],
  infrastructure_network: ['factom', 6],
  crypto_treasury: ['twenty-one-capital', 5],
  miner: ['terawulf', 3],
  etf: ['bsol', 3],
};

describe('full-corpus canonical profile adapter', () => {
  let census;

  beforeAll(async () => {
    census = await buildProfileAdapterCensus();
  });

  it('replays every migration and resolves every stored entity across all 13 types', () => {
    expect(census.total).toBe(329);
    expect(Object.keys(census.by_type)).toEqual(Object.keys(EXPECTED_COUNTS));
    expect(census.chain_facts).toEqual({ total: 55, not_found: 0, zero_section: 0 });
    expect(census.blockchain_union).toEqual({
      total: 90,
      by_source: {
        chain_facts: 55,
        dead_chains: 26,
        mid_chains: 20,
        chain_analysis: 25,
      },
      overlap_profiles: 31,
      chain_facts_backed: 55,
      legacy_only: 35,
      membership_patterns: {
        'chain_analysis+chain_facts+mid_chains': 5,
        'chain_analysis+chain_facts': 20,
        'chain_facts+mid_chains': 6,
        chain_facts: 24,
        dead_chains: 26,
        mid_chains: 9,
      },
      not_found: 0,
      zero_section: 0,
      dishonest_gaps: 0,
    });
    expect(census.rows).toHaveLength(329);
    expect(census.rows.every((row) => row.http_status === 200)).toBe(true);
    expect(census.rows.every((row) => row.section_count > 0)).toBe(true);
  });

  it('prefers forensic chain facts and identity-matched canonical profiles over thinner legacy rows', () => {
    expect(census.blockchain_precedence).toEqual({
      forensic_fact_profiles: 20,
      forensic_fact_mismatches: [],
      embedded_canonical_over_lower_depth_legacy: true,
    });
  });

  it('keeps exact per-type depth and validation counts intentional', () => {
    for (const [type, expected] of Object.entries(EXPECTED_COUNTS)) {
      const row = census.by_type[type];
      expect([
        row.total,
        row.sections_0,
        row.sections_1_2,
        row.sections_3_9,
        row.sections_10,
        row.validation_error_profiles,
        row.validation_errors,
      ], type).toEqual(expected);
    }
  });

  it('does not stringify private objects or manufacture unsupported report depth', () => {
    for (const [type, summary] of Object.entries(census.by_type)) {
      expect(summary.raw_object_leaks, `${type} raw-object leaks`).toBe(0);
      expect(summary.dishonest_gap_profiles, `${type} unsupported fields without gaps`).toBe(0);
      expect(summary.not_found, `${type} missing routes`).toBe(0);
    }
  });

  it('classifies research debt separately from adapter contract failures', () => {
    const classes = census.rows.reduce((totals, row) => {
      for (const [name, count] of Object.entries(row.validation_error_classes)) {
        totals[name] = (totals[name] || 0) + count;
      }
      return totals;
    }, {});
    expect(classes).toEqual({
      source_metadata_debt: 2800,
      citation_debt: 1458,
      structural_contract_error: 11,
    });

    const structural = census.rows.filter((row) => row.validation_error_classes.structural_contract_error);
    expect(structural.every((row) => row.type === 'web3_casino')).toBe(true);
    expect(structural.map((row) => row.slug)).toEqual([
      'bc-game-curacao-small-house',
      'cloudbet-dot-com',
      'coinpoker-dot-com',
      'duelbits-dot-com',
      'funfair-b2b-platform',
      'kingtiger-casino',
      'rollbit-dot-com',
      'stake-dot-com',
      'wink-gaming-platform',
      'winr-protocol-bankroll',
    ]);
  });

  it('compares each adapter against its richest legacy control row', () => {
    for (const [type, [slug, sections]] of Object.entries(RICHEST_CONTROLS)) {
      expect(census.by_type[type].richest_legacy.slug, type).toBe(slug);
      expect(census.by_type[type].richest_legacy.canonical_sections, type).toBe(sections);
    }
  });
});

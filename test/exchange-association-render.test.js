// Behavioral tests for the exchange outcome-association renderer.
//
// These functions turn `outcomeAssociations`/`trendReadiness`/`hypotheses`
// (produced by src/lib/exchange-analysis.js) into the uncertainty-first HTML
// shown on the DEX/CEX Analysis page. Extracted and executed directly from
// public/index.html so behavior (not just string presence) is verified,
// following the pattern in test/capital-render.test.js and test/scoring.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
function grab(name, kind) {
  const re = kind === 'const'
    ? new RegExp('const ' + name + ' = [\\s\\S]*?;\\n')
    : new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}\\n');
  const m = html.match(re);
  if (!m) throw new Error('not found in index.html: ' + name);
  return m[0];
}

const build = () => new Function([
  'const esc = (s) => String(s).replace(/[&<>"\']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","\'":"&#39;" }[c]));',
  grab('exchangeLabel', 'fn'),
  grab('exchangeAssociationRows', 'fn'),
  grab('exchangeAssociationPanel', 'fn'),
].join('\n') + '; return { exchangeAssociationRows, exchangeAssociationPanel };')();

const F = build();

function row(overrides = {}) {
  return {
    key: 'documented_launched',
    sampleSize: 4,
    successful: 2,
    successRate: 0.5,
    ci95: { low: 0.15, high: 0.85 },
    smallSample: false,
    ...overrides,
  };
}

describe('exchangeAssociationRows', () => {
  it('returns an empty string for missing or empty input', () => {
    expect(F.exchangeAssociationRows(null)).toBe('');
    expect(F.exchangeAssociationRows(undefined)).toBe('');
    expect(F.exchangeAssociationRows([])).toBe('');
  });

  it('renders sample size, rounded percentage, and uncertainty text', () => {
    const out = F.exchangeAssociationRows([row()]);
    expect(out).toContain('n=4');
    expect(out).toContain('2/4 successful');
    expect(out).toContain('50%');
    expect(out).toContain('95% CI 15–85%');
  });

  it('applies the good/warn/muted tone thresholds', () => {
    const good = F.exchangeAssociationRows([row({ successRate: 0.5 })]);
    const warn = F.exchangeAssociationRows([row({ successRate: 0.25 })]);
    const muted = F.exchangeAssociationRows([row({ successRate: 0.24 })]);
    expect(good).toContain('tagbar good');
    expect(warn).toContain('tagbar warn');
    expect(muted).toContain('tagbar muted');
  });

  it('appends a small-sample caveat only when smallSample is true', () => {
    const withCaveat = F.exchangeAssociationRows([row({ smallSample: true })]);
    const withoutCaveat = F.exchangeAssociationRows([row({ smallSample: false })]);
    expect(withCaveat).toContain('small sample');
    expect(withoutCaveat).not.toContain('small sample');
  });

  it('prefers an explicit label over the derived exchangeLabel fallback', () => {
    const withLabel = F.exchangeAssociationRows(
      [row({ key: 'documented_launched' })],
      { documented_launched: 'documented token launch' },
    );
    const withoutLabel = F.exchangeAssociationRows([row({ key: 'documented_launched' })]);
    expect(withLabel).toContain('documented token launch');
    expect(withoutLabel).toContain('documented launched');
    expect(withoutLabel).not.toContain('documented token launch');
  });

  it('falls back to exchangeLabel (underscore-to-space) for unknown keys with no label override', () => {
    const out = F.exchangeAssociationRows([row({ key: 'liquidity_aggregator' })]);
    expect(out).toContain('liquidity aggregator');
  });

  it('clamps out-of-range success rates into the 0..1 bar width', () => {
    const over = F.exchangeAssociationRows([row({ successRate: 1.4 })]);
    const under = F.exchangeAssociationRows([row({ successRate: -0.4 })]);
    expect(over).toContain('width:100.0%');
    expect(over).toContain('100%');
    expect(under).toContain('width:0.0%');
    expect(under).toContain('0%');
  });

  it('escapes HTML-sensitive characters in the derived aria-label and row label', () => {
    const out = F.exchangeAssociationRows([row({ key: '<script>' })]);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('defaults missing sampleSize/successful/ci95 fields to zero instead of throwing', () => {
    const out = F.exchangeAssociationRows([{ key: 'unknown' }]);
    expect(out).toContain('n=0');
    expect(out).toContain('0/0 successful');
    expect(out).toContain('95% CI 0–0%');
    expect(out).toContain('0%');
  });

  it('joins multiple rows with no separator between the rendered divs', () => {
    const out = F.exchangeAssociationRows([
      row({ key: 'documented_launched' }),
      row({ key: 'not_identified', successRate: 0 }),
    ]);
    const matches = out.match(/class="tagrow"/g) || [];
    expect(matches).toHaveLength(2);
    expect(out).not.toContain('undefined');
  });
});

describe('exchangeAssociationPanel', () => {
  function summary(overrides = {}) {
    return {
      outcomeAssociations: {
        overall: row(),
        tokenLaunch: [row({ key: 'documented_launched' })],
        primaryChain: [
          row({ key: 'Ethereum', sampleSize: 3 }),
          row({ key: 'Base', sampleSize: 1 }),
        ],
        productCohort: [row({ key: 'spot_amm', sampleSize: 2 })],
        method: 'Descriptive association only. Uses Wilson score intervals.',
      },
      trendReadiness: {
        causalDossiers: 1,
        totalCases: 4,
        documentedTokenCases: 1,
        currentEvidenceCases: 2,
        comparableMetricGroups: 1,
      },
      hypotheses: [
        {
          variable: 'token_launch',
          hypothesis: 'Token launch may correlate with success.',
          falsifier: 'The effect disappears in matched cohorts.',
        },
      ],
      ...overrides,
    };
  }

  it('renders nothing when summary is missing or has no outcomeAssociations', () => {
    expect(F.exchangeAssociationPanel(null, 'DEX')).toBe('');
    expect(F.exchangeAssociationPanel({}, 'DEX')).toBe('');
  });

  it('renders the section header with the escaped label', () => {
    const out = F.exchangeAssociationPanel(summary(), 'DEX');
    expect(out).toContain('Patterns in the DEX reports');
  });

  it('excludes primary-chain and product-cohort singleton rows (sampleSize < 2) from their charts', () => {
    const out = F.exchangeAssociationPanel(summary(), 'DEX');
    expect(out).toContain('Ethereum');
    expect(out).not.toContain('>Base<');
  });

  it('shows the withheld-singleton message when every chain cohort has sampleSize < 2', () => {
    const out = F.exchangeAssociationPanel(summary({
      outcomeAssociations: {
        ...summary().outcomeAssociations,
        primaryChain: [row({ key: 'Solana', sampleSize: 1 })],
      },
    }), 'DEX');
    expect(out).toContain('single cases are withheld from the chart');
  });

  it('shows "No token cohorts." when tokenLaunch is empty', () => {
    const out = F.exchangeAssociationPanel(summary({
      outcomeAssociations: { ...summary().outcomeAssociations, tokenLaunch: [] },
    }), 'DEX');
    expect(out).toContain('No token cohorts.');
  });

  it('shows "No repeated product cohort." when every product cohort is a singleton', () => {
    const out = F.exchangeAssociationPanel(summary({
      outcomeAssociations: {
        ...summary().outcomeAssociations,
        productCohort: [row({ key: 'spot_amm', sampleSize: 1 })],
      },
    }), 'DEX');
    expect(out).toContain('No repeated product cohort.');
  });

  it('caps primary-chain rows at 8 and product-cohort rows at 10', () => {
    const manyChains = Array.from({ length: 12 }, (_, i) => row({ key: `chain-${i}`, sampleSize: 2 }));
    const manyCohorts = Array.from({ length: 15 }, (_, i) => row({ key: `cohort-${i}`, sampleSize: 2 }));
    const out = F.exchangeAssociationPanel(summary({
      outcomeAssociations: {
        ...summary().outcomeAssociations,
        primaryChain: manyChains,
        productCohort: manyCohorts,
      },
    }), 'DEX');
    const chainMatches = manyChains.filter((r) => out.includes(`>${r.key}<`));
    const cohortMatches = manyCohorts.filter((r) => out.includes(`>${r.key}<`));
    expect(chainMatches).toHaveLength(8);
    expect(cohortMatches).toHaveLength(10);
  });

  it('summarizes the comparison in plain language', () => {
    const out = F.exchangeAssociationPanel(summary(), 'DEX');
    expect(out).toContain('This comparison uses 4 reports.');
    expect(out).toContain('1 explain the outcome');
    expect(out).toContain('1 document whether a token launched');
    expect(out).toContain('Small groups are clues, not conclusions.');
  });

  it('does not leak generated research prompts into customer copy', () => {
    const out = F.exchangeAssociationPanel(summary(), 'DEX');
    expect(out).not.toContain('Patterns worth testing as more reports are added');
    expect(out).not.toContain('Token launch may correlate with success.');
    expect(out).not.toContain('What would challenge this:');
  });

  it('omits the hypotheses section entirely when there are no hypotheses', () => {
    const out = F.exchangeAssociationPanel(summary({ hypotheses: [] }), 'DEX');
    expect(out).not.toContain('Patterns worth testing');
  });

  it('defaults trendReadiness fields to zero when trendReadiness is missing', () => {
    const out = F.exchangeAssociationPanel(summary({ trendReadiness: undefined }), 'DEX');
    expect(out).toContain('This comparison uses 0 reports.');
    expect(out).toContain('0 explain the outcome');
  });

  it('escapes the panel label', () => {
    const out = F.exchangeAssociationPanel(summary(), '<b>DEX</b>');
    expect(out).not.toContain('<b>DEX</b> outcome');
    expect(out).toContain('&lt;b&gt;DEX&lt;/b&gt;');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function functionBlock(startName, nextName) {
  const start = html.indexOf(`function ${startName}(`);
  const end = html.indexOf(`function ${nextName}(`, start);
  if (start < 0 || end < 0) throw new Error(`missing UI function block: ${startName}`);
  return html.slice(start, end);
}

function buildEvidenceRenderers() {
  return new Function(`
    const esc = (value) => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
    const safeUrl = (value) => String(value || '');
    const parsedObject = (value) => value && typeof value === 'object' ? value : {};
    const exchangeLabel = (value) => String(value || '');
    const proseBox = (value) => '<div class="prose">' + esc(value) + '</div>';
    const forensicReviewState = () => 'current';
    ${functionBlock('evidenceStatusParts', 'sourceMetadataHtml')}
    ${functionBlock('sourceMetadataHtml', 'srcHtml')}
    ${functionBlock('forensicRefHtml', 'publicationDepthGap')}
    ${functionBlock('publicationDepthGap', 'publicationPendingHtml')}
    ${functionBlock('publicationPendingHtml', 'forensicAnalysisHtml')}
    ${functionBlock('forensicAnalysisHtml', 'synthesisHtml')}
    ${functionBlock('casinoPublicationDepthBanner', 'casinoDepthSectionHtml')}
    ${functionBlock('casinoDepthSectionHtml', 'casinoDetailBody')}
    return { forensicAnalysisHtml, casinoPublicationDepthBanner, casinoDepthSectionHtml };
  `)();
}

describe('casino evidence-state UI', () => {
  it('labels an unreviewed causal citation and withholds an unsupported causal section', () => {
    const { forensicAnalysisHtml } = buildEvidenceRenderers();
    const source = {
      url: 'https://operator.example/status',
      title: 'Operator status',
      source_tier: 'B',
      source_role: 'primary',
      registered: true,
      reachable: true,
      evidence_reviewed: false,
    };
    const output = forensicAnalysisHtml({
      version: 'forensic-analysis-v1',
      outcome: {
        label: 'middling',
        summary: 'Supported lifecycle summary.',
        source_refs: [source.url],
      },
      why: {
        summary: 'UNSUPPORTED CAUSAL TEXT',
        source_refs: [source.url],
      },
      strategic_choices: [],
      counterfactual: {},
      watch: [],
      unknowns: [],
    }, () => source, 'pending', {
      unresolved_high_risk_claims: [{
        path: 'forensic_analysis.why',
        type: 'causal',
        gaps: ['high_risk_evidence_threshold_not_met'],
      }],
    });

    expect(output).toContain('Supported lifecycle summary.');
    expect(output).toContain('registered · reachable · editor review pending · tier B · role primary');
    expect(output).toContain('Why this outcome withheld — independent support pending.');
    expect(output).not.toContain('UNSUPPORTED CAUSAL TEXT');
  });

  it('renders dossier counts and replaces unsupported synthesis prose with a pending notice', () => {
    const { casinoPublicationDepthBanner, casinoDepthSectionHtml } = buildEvidenceRenderers();
    const depth = {
      high_risk_claim_count: 9,
      passing_high_risk_claim_count: 2,
      unresolved_high_risk_claim_count: 7,
      unresolved_high_risk_claims: [{
        path: 'forensic_analysis.counterfactual',
        type: 'causal',
        gaps: ['no_resolving_reviewed_evidence'],
      }],
    };
    const banner = casinoPublicationDepthBanner(depth);
    const section = casinoDepthSectionHtml(
      'Counterfactual',
      'SHOULD NOT RENDER',
      depth,
      (gap) => gap.path === 'forensic_analysis.counterfactual',
    );

    expect(banner).toContain('2 of 9 meet policy · 7 pending / withheld');
    expect(banner).toContain('Corpus inclusion measures indexed coverage, not editorial claim support.');
    expect(section).toContain('Counterfactual withheld — independent support pending.');
    expect(section).not.toContain('SHOULD NOT RENDER');
  });
});

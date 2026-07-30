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
    ${functionBlock('publicationDepthBanner', 'publicationDepthEvidenceHtml')}
    ${functionBlock('publicationDepthEvidenceHtml', 'publicationDepthSectionHtml')}
    ${functionBlock('publicationDepthSectionHtml', 'casinoPublicationDepthBanner')}
    ${functionBlock('casinoPublicationDepthBanner', 'casinoDepthSectionHtml')}
    ${functionBlock('casinoDepthSectionHtml', 'casinoDetailBody')}
    return { forensicAnalysisHtml, casinoPublicationDepthBanner, casinoDepthSectionHtml };
  `)();
}

function buildCasinoCardRenderer() {
  return new Function(`
    const esc = (value) => String(value ?? '');
    const casinoLabel = (value) => String(value || '').replaceAll('_', ' ');
    const analysisText = (value) => Array.isArray(value) ? value.map(String).join(' · ') : (value == null ? '' : String(value));
    const proseBox = (value) => '<div class="prose">' + esc(value) + '</div>';
    const casinoDetailBody = () => '';
    const state = {
      casinoAnalysisExpanded: null,
      casinoAnalysisDetails: {},
    };
    ${functionBlock('plainEnglishRead', 'distributionItems')}
    ${functionBlock('publicationDepthGap', 'publicationPendingHtml')}
    ${functionBlock('casinoAnalysisCard', 'renderCasinoAnalysis')}
    return casinoAnalysisCard;
  `)();
}

function buildCasinoRecordRenderers() {
  return new Function(`
    const esc = (value) => String(value ?? '');
    const fmtNum = (value) => String(value);
    const fmtUsd = (value) => String(value);
    ${functionBlock('casinoLabel', 'casinoObservationHtml')}
    ${functionBlock('casinoObservationHtml', 'casinoOutlookText')}
    ${functionBlock('publicationPendingHtml', 'forensicAnalysisHtml')}
    return { casinoObservationHtml, casinoEventHtml, casinoLicenceHtml };
  `)();
}

function buildCasinoSynthesisGuards() {
  return new Function(`
    ${functionBlock('casinoOutlookUnsupported', 'casinoLessonsUnsupported')}
    ${functionBlock('casinoLessonsUnsupported', 'casinoReviewState')}
    return { casinoOutlookUnsupported, casinoLessonsUnsupported };
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

  it('withholds unsupported lifecycle and outcome labels on the collapsed card', () => {
    const casinoAnalysisCard = buildCasinoCardRenderer();
    const output = casinoAnalysisCard({
      case_id: 'pending-casino',
      brand_name: 'Pending Casino',
      entity_kind: 'custodial_operator',
      product_subtype: 'casino',
      primary_domain: 'pending.example',
      status: 'insolvent',
      status_as_of: '2026-07-29',
      outcome_label: 'failed',
      completeness_pct: 80,
      last_reviewed: '2026-07-29',
      chains: ['Ethereum'],
      product_scope_note: 'Neutral scoped research dossier.',
      registered_source_count: 2,
      reachable_source_count: 2,
      reviewed_source_count: 0,
      publication_depth: {
        high_risk_claim_count: 2,
        passing_high_risk_claim_count: 0,
        unresolved_high_risk_claim_count: 2,
        unresolved_high_risk_claims: [{
          path: 'forensic_analysis.outcome',
          type: 'lifecycle',
          gaps: ['high_risk_evidence_threshold_not_met'],
        }],
      },
    });

    expect(output).toContain('support pending');
    expect(output).toContain('outcome withheld — independent support pending');
    expect(output).not.toContain('>insolvent<');
    expect(output).not.toContain('· failed ·');
  });

  it('withholds unsupported observation, event, and licence records', () => {
    const {
      casinoObservationHtml,
      casinoEventHtml,
      casinoLicenceHtml,
    } = buildCasinoRecordRenderers();
    const pending = { publication_support: 'pending_independent_support' };
    const output = [
      casinoObservationHtml({
        ...pending,
        metric_dimension: 'loss',
        value: 123456,
        method: 'UNSUPPORTED METRIC METHOD',
      }),
      casinoEventHtml({
        ...pending,
        event_type: 'insolvency',
        event_date: '2026-01-01',
        description: 'UNSUPPORTED INSOLVENCY EVENT',
      }),
      casinoLicenceHtml({
        ...pending,
        authority: 'UNSUPPORTED REGULATOR',
        licence_status: 'revoked',
        activities: [],
      }),
    ].join('');

    expect(output).not.toContain('123456');
    expect(output).not.toContain('UNSUPPORTED METRIC METHOD');
    expect(output).not.toContain('UNSUPPORTED INSOLVENCY EVENT');
    expect(output).not.toContain('UNSUPPORTED REGULATOR');
    expect(output).toContain('Metric observation withheld');
    expect(output).toContain('Lifecycle event withheld');
    expect(output).toContain('Licence observation withheld');
  });

  it('withholds casino outlook and lessons when their causal support is pending', () => {
    const {
      casinoOutlookUnsupported,
      casinoLessonsUnsupported,
    } = buildCasinoSynthesisGuards();
    expect(casinoOutlookUnsupported({ path: 'forensic_analysis.outcome' })).toBe(true);
    expect(casinoOutlookUnsupported({ path: 'forensic_analysis.why' })).toBe(true);
    expect(casinoLessonsUnsupported({ path: 'forensic_analysis.why' })).toBe(true);
    expect(casinoLessonsUnsupported({
      path: 'forensic_analysis.strategic_choices[0]',
    })).toBe(true);
    expect(casinoLessonsUnsupported({ path: 'forensic_analysis.counterfactual' })).toBe(true);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function functionBlock(startName, nextName) {
  const start = html.indexOf(`function ${startName}(`);
  const end = html.indexOf(`function ${nextName}(`, start);
  if (start < 0 || end < 0) throw new Error(`missing UI function block: ${startName}`);
  return html.slice(start, end);
}

function renderers() {
  return new Function(`
    const esc = (value) => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
    const safeUrl = (value) => String(value || '');
    const proseBox = (value) => '<div class="prose">' + esc(value) + '</div>';
    const analysisText = (value) => String(value || '');
    ${functionBlock('evidenceStatusParts', 'sourceMetadataHtml')}
    ${functionBlock('sourceMetadataHtml', 'srcHtml')}
    ${functionBlock('srcHtml', 'nftEvidenceHtml')}
    ${functionBlock('exchangeFindingLabel', 'exchangeFindingHtml')}
    ${functionBlock('exchangeFindingHtml', 'exchangeTokenLine')}
    ${functionBlock('exchangeRiskNotesHtml', 'exchangeOutlookHtml')}
    ${functionBlock('exchangeOutlookHtml', 'exchangeAnalysisDetails')}
    ${functionBlock('publicationDepthGap', 'publicationPendingHtml')}
    ${functionBlock('publicationPendingHtml', 'forensicAnalysisHtml')}
    ${functionBlock('publicationDepthEvidenceHtml', 'publicationDepthSectionHtml')}
    ${functionBlock('publicationDepthSectionHtml', 'casinoPublicationDepthBanner')}
    ${functionBlock('nftLifecycleReadHtml', 'renderNft')}
    return {
      exchangeFindingHtml,
      exchangeOutlookHtml,
      exchangeRiskNotesHtml,
      nftLifecycleReadHtml,
      publicationDepthEvidenceHtml,
      publicationDepthSectionHtml,
      srcHtml,
    };
  `)();
}

function exchangeCardRenderer() {
  return new Function(`
    const esc = (value) => String(value ?? '');
    const state = { exchangeAnalysisExpanded: null };
    const srcHtml = () => '';
    const exchangeAnalysisDetails = () => '';
    const exchangeTokenLine = () => '';
    const exchangeMetric = () => '—';
    const fmtUsd = (value) => String(value);
    const exchangeLabel = (value) => String(value || '').replaceAll('_', ' ');
    const exchangeFindingHtml = () => '';
    const publicationDepthEvidenceHtml = () => '';
    ${functionBlock('lifecycleLabel', 'lifecycleClass')}
    ${functionBlock('lifecycleClass', 'exchangeLabel')}
    ${functionBlock('publicationDepthGap', 'publicationPendingHtml')}
    ${functionBlock('exchangeAnalysisCard', 'exchangeTrendSummary')}
    return exchangeAnalysisCard;
  `)();
}

const source = {
  id: 'registered-source',
  title: 'Registered source',
  url: 'https://independent.example/evidence',
  registered: true,
  resolving: true,
  evidence_reviewed: false,
  source_tier: 'T2',
  source_role: 'independent',
};

function depth(path) {
  return {
    registered_source_count: 1,
    reachable_source_count: 1,
    reviewed_source_count: 0,
    high_risk_claim_count: 1,
    passing_high_risk_claim_count: 0,
    unresolved_high_risk_claim_count: 1,
    unresolved_high_risk_claims: [{
      path,
      type: 'causal',
      gaps: ['no_resolving_reviewed_evidence'],
    }],
  };
}

describe('cross-vertical publication-depth UI', () => {
  it('withholds exchange card/detail finding prose and preserves source access', () => {
    const {
      exchangeFindingHtml,
      publicationDepthEvidenceHtml,
      srcHtml,
    } = renderers();
    const publicationDepth = depth('forensic_analysis.why');
    const output = [
      exchangeFindingHtml({
        lifecycle: 'dead',
        summary: 'UNSUPPORTED EXCHANGE WHY',
        publicationDepth,
      }),
      publicationDepthEvidenceHtml(publicationDepth),
      srcHtml([source], 'Cited sources: '),
    ].join('');

    expect(output).not.toContain('UNSUPPORTED EXCHANGE WHY');
    expect(output).toContain('What happened withheld — independent support pending.');
    expect(output).toContain('Claims checked: 0/1');
    expect(output).toContain('Registered source');
    expect(output).toContain('source linked · source checked · editor review pending');
  });

  it('withholds NFT card/detail lifecycle prose and preserves source access', () => {
    const {
      nftLifecycleReadHtml,
      publicationDepthEvidenceHtml,
      srcHtml,
    } = renderers();
    const publicationDepth = depth('forensic_analysis.outcome');
    const output = [
      nftLifecycleReadHtml({
        analysis: 'UNSUPPORTED NFT LIFECYCLE',
      }, publicationDepth),
      publicationDepthEvidenceHtml(publicationDepth),
      srcHtml([source], 'Cited sources: '),
    ].join('');

    expect(output).not.toContain('UNSUPPORTED NFT LIFECYCLE');
    expect(output).toContain('Lifecycle read withheld — independent support pending.');
    expect(output).toContain('Registered source');
    expect(output).toContain('source linked · source checked · editor review pending');
  });

  it('renders non-high-risk sections when no predicate is supplied', () => {
    const { publicationDepthSectionHtml } = renderers();
    const output = publicationDepthSectionHtml(
      'Operating model',
      'Observed product architecture.',
      depth('forensic_analysis.why'),
    );

    expect(output).toContain('Observed product architecture.');
    expect(output).not.toContain('withheld');
  });

  it('withholds unsupported exchange risk and outlook prose', () => {
    const { exchangeOutlookHtml, exchangeRiskNotesHtml } = renderers();
    const publicationDepth = depth('forensic_analysis.outcome');
    const output = [
      exchangeRiskNotesHtml('UNSUPPORTED EXCHANGE RISK', publicationDepth),
      exchangeOutlookHtml('UNSUPPORTED EXCHANGE OUTLOOK', publicationDepth),
    ].join('');

    expect(output).not.toContain('UNSUPPORTED EXCHANGE RISK');
    expect(output).not.toContain('UNSUPPORTED EXCHANGE OUTLOOK');
    expect(output).toContain('Risk notes withheld');
    expect(output).toContain('Outlook withheld');
  });

  it('qualifies the exchange card badge while preserving the sortable indexed cohort', () => {
    const exchangeAnalysisCard = exchangeCardRenderer();
    const output = exchangeAnalysisCard({
      kind: 'cex',
      lifecycle: 'dead',
      slug: 'pending-exchange',
      name: 'Pending Exchange',
      profile: {},
      token: {},
      sources: [],
      venueType: 'exchange',
      productCohort: 'centralized_exchange',
      qualityLabel: 'partial',
      forensicStatus: 'published',
      metricLabel: 'metric',
      publicationDepth: {
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
    expect(output).toContain('outcome: dead / winding down');
    expect(output).not.toContain('>dead / winding down<');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function functionBlock(startName, nextName) {
  const start = html.indexOf(`function ${startName}(`);
  const end = html.indexOf(`function ${nextName}(`, start);
  if (start < 0 || end < 0) throw new Error(`missing UI function block: ${startName}`);
  return html.slice(start, end);
}

function renderer() {
  return new Function(`
    const esc = (value) => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
    const safeUrl = (value) => String(value || '');
    ${functionBlock('evidenceStatusParts', 'sourceMetadataHtml')}
    ${functionBlock('sourceMetadataHtml', 'srcHtml')}
    ${functionBlock('nftEvidenceHtml', 'nftFreshnessHtml')}
    ${functionBlock('publicationDepthGap', 'publicationPendingHtml')}
    return nftEvidenceHtml;
  `)();
}

function riskRenderer() {
  return new Function(`
    const esc = (value) => String(value ?? '');
    const safeUrl = (value) => String(value || '');
    ${functionBlock('evidenceStatusParts', 'sourceMetadataHtml')}
    ${functionBlock('sourceMetadataHtml', 'srcHtml')}
    ${functionBlock('srcHtml', 'nftEvidenceHtml')}
    ${functionBlock('nftRiskHtml', 'nftNarrativeSectionHtml')}
    return nftRiskHtml;
  `)();
}

function narrativeRenderer() {
  return new Function(`
    const esc = (value) => String(value ?? '');
    const proseBox = (value) => '<div class="prose">' + esc(value) + '</div>';
    ${functionBlock('publicationPendingHtml', 'forensicAnalysisHtml')}
    ${functionBlock('nftNarrativeSectionHtml', 'nftLifecycleMetric')}
    return nftNarrativeSectionHtml;
  `)();
}

describe('NFT field-evidence UI', () => {
  it('shows reader-facing source dates without internal retrieval plumbing', () => {
    const nftEvidenceHtml = renderer();
    const output = nftEvidenceHtml({
      citation_schema: 'field-v1',
      evidence: [{
        field: 'launch',
        value: '2024-01',
        as_of: '2024-01-31',
        basis: 'operator',
        source_ids: ['review-boundary'],
      }],
    }, [{
      id: 'review-boundary',
      title: 'Reviewed boundary source',
      url: 'https://operator.example/review-boundary',
      access_state: 'accessible',
      access_checked_at: '2026-07-29',
      access_note: 'HTTP 200; retrieval observed without claim re-review.',
      resolving: true,
      evidence_reviewed: false,
      source_tier: 'T2',
      source_role: 'primary',
    }], null, {
      claim_support: [],
      unresolved_high_risk_claims: [],
    });

    expect(output).not.toContain('access accessible');
    expect(output).not.toContain('retrieval note:');
    expect(output).not.toContain('desk check pending');
    expect(output).toContain('Reviewed boundary source');
    expect(output).toContain('2024-01');
  });

  it('withholds an unsupported high-risk value while preserving source state', () => {
    const nftEvidenceHtml = renderer();
    const output = nftEvidenceHtml({
      citation_schema: 'field-v1',
      evidence: [{
        field: 'lifecycle_status',
        value: 'UNSUPPORTED DEAD CLAIM',
        as_of: '2026-07-29',
        basis: 'operator',
        source_ids: ['operator-status'],
      }],
    }, [{
      id: 'operator-status',
      title: 'Operator status',
      url: 'https://operator.example/status',
      resolving: true,
      evidence_reviewed: false,
      source_tier: 'T2',
      source_role: 'primary',
    }], null, {
      unresolved_high_risk_claims: [{
        path: 'evidence[0].lifecycle_status',
        type: 'lifecycle',
        gaps: ['no_resolving_reviewed_evidence'],
      }],
    });

    expect(output).not.toContain('UNSUPPORTED DEAD CLAIM');
    expect(output).toContain('conclusion not published — stronger evidence needed');
    expect(output).toContain('Conclusion not published yet.');
    expect(output).not.toContain('desk check pending');
    expect(output).toContain('Operator status');
  });

  it('withholds legacy Azuki risk allegations while preserving registered source links', () => {
    const nftRiskHtml = riskRenderer();
    const output = nftRiskHtml({
      level: 'high',
      summary: 'AZUKI UNSUPPORTED SOFT-RUG ALLEGATION',
      evidence: 'AZUKI UNSUPPORTED LEGAL DETAIL',
      sources: JSON.stringify([
        'https://www.coindesk.com/business/2022/05/10/azuki-nft-founder-admits-to-abandoning-past-projects',
      ]),
    }, {
      unresolved_high_risk_claim_count: 8,
    });

    expect(output).not.toContain('AZUKI UNSUPPORTED SOFT-RUG ALLEGATION');
    expect(output).not.toContain('AZUKI UNSUPPORTED LEGAL DETAIL');
    expect(output).toContain('Risk allegation not published');
    expect(output).toContain('coindesk.com/business/2022/05/10/');
    expect(output).not.toContain('desk check pending');
  });

  it('withholds unsupported Azuki narrative fields and uncontracted Quantum Cats prose', () => {
    const nftNarrativeSectionHtml = narrativeRenderer();
    const azuki = nftNarrativeSectionHtml(
      'Community history',
      'community_history',
      'AZUKI TRUST-DAMAGE ALLEGATION',
      {
        claim_support: [{
          path: 'evidence[3].community_history',
          type: 'causal',
          high_risk: true,
          passes: false,
        }],
        unresolved_high_risk_claims: [{
          path: 'evidence[3].community_history',
          type: 'causal',
          gaps: ['high_risk_evidence_threshold_not_met'],
        }],
      },
    );
    const quantumCats = nftNarrativeSectionHtml(
      'Founder engagement',
      'founder_engagement',
      'QUANTUM CATS UNCONTRACTED FOUNDER CLAIM',
      {
        claim_support: [],
        unresolved_high_risk_claims: [],
      },
    );

    expect(azuki).not.toContain('AZUKI TRUST-DAMAGE ALLEGATION');
    expect(azuki).toContain('Community history is still open');
    expect(quantumCats).not.toContain('QUANTUM CATS UNCONTRACTED FOUNDER CLAIM');
    expect(quantumCats).toContain('Founder engagement is still open');
  });
});

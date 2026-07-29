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

describe('NFT field-evidence UI', () => {
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
    expect(output).toContain('withheld — independent support pending');
    expect(output).toContain('High-risk field conclusion withheld.');
    expect(output).toContain('registered · reachable · editor review pending');
    expect(output).toContain('Operator status');
  });
});

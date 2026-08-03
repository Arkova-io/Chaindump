import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { ENTITY_PROFILE_BROWSER_FIXTURES } from './fixtures/entity-profile-ui.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

function profileRenderer() {
  const taxonomyStart = html.indexOf('const PUBLIC_TAXONOMY_ACRONYMS');
  const taxonomyEnd = html.indexOf('\n// ---------------------------------------------------------------------------\n// Canonical page layout.', taxonomyStart);
  const start = html.indexOf('const PROFILE_SECTION_ORDER');
  const end = html.indexOf('\nfunction synthesisHtml', start);
  if (taxonomyStart < 0 || taxonomyEnd < 0 || start < 0 || end < 0) {
    throw new Error('canonical profile renderer not found');
  }
  const source = `${html.slice(taxonomyStart, taxonomyEnd)}\n${html.slice(start, end)}`;
  const context = {
    Date, Intl, URL,
    state: { profileCache: {}, profileRequest: 0 },
    document: { getElementById: () => null },
    history: { pushState() {}, replaceState() {} },
    location: { pathname: '/' },
    fetch: async () => { throw new Error('not used in renderer test'); },
    switchView() {},
    fmtUsd: (value) => `$${Number(value).toLocaleString('en-US')}`,
    esc: (value) => String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;'),
    safeUrl: (value) => /^https:\/\//.test(String(value || '')) ? String(value) : '#',
    normalizedText: (value) => typeof value === 'string' ? value.trim() : '',
    customerCopy: (value) => String(value ?? '')
      .replace(/\bdossiers\b/gi, 'reports')
      .replace(/\bdossier\b/gi, 'report'),
    normalizedLabel: (key) => String(key).replaceAll('_', ' '),
    verdictClass: () => 'declining',
  };
  vm.runInNewContext(source, context);
  return context;
}

describe('shared human-facing entity profile UI', () => {
  it('uses one renderer and one route for every supported entity family', () => {
    const renderer = profileRenderer();
    const types = Object.keys(ENTITY_PROFILE_BROWSER_FIXTURES);
    expect(types).toHaveLength(13);

    for (const [type, fixture] of Object.entries(ENTITY_PROFILE_BROWSER_FIXTURES)) {
      const output = renderer.canonicalProfileHtml(fixture);
      expect(output).toContain(`data-entity-profile="${type}"`);
      expect(renderer.profileHref(type, 'Example Name')).toBe(`/profile/${type}/example-name`);
      expect(output).toContain('Readable evidence');
      expect(output).toContain('Observed value');
      expect(output).not.toContain('private-source-id');
      expect(output).not.toContain('private-claim-record');
      expect(output).not.toContain('private-table');
      expect(output).not.toContain('validation_errors');
      expect(output).not.toContain('structured_analysis');
    }
  });

  it('translates machine enums into reader-facing labels across all 13 profile types', () => {
    const { canonicalProfileHtml } = profileRenderer();
    for (const fixture of Object.values(ENTITY_PROFILE_BROWSER_FIXTURES)) {
      const raw = structuredClone(fixture);
      raw.identity.name = 'Example profile';
      raw.outcome.label = 'middling_declining';
      raw.classification.subtype = 'centralized_multi_product_exchange';
      raw.classification.chains = ['BNB_Smart_Chain', 'dYdX'];
      const output = canonicalProfileHtml(raw);
      const visibleText = output.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

      expect(visibleText).toContain('Middling declining');
      expect(visibleText).toContain('Centralized multi-product exchange · BNB Smart Chain · dYdX');
      expect(visibleText).not.toMatch(/\b(?:middling_declining|centralized_multi_product_exchange|BNB_Smart_Chain)\b/);
    }
  });

  it('keeps the report anatomy in the requested order, then renders metrics and evidence', () => {
    const { canonicalProfileHtml } = profileRenderer();
    const output = canonicalProfileHtml(ENTITY_PROFILE_BROWSER_FIXTURES.blockchain);
    const labels = [
      'What it is', 'What happened', 'Why this outcome', 'Strategic choices',
      'Operating model', 'Token and value capture', 'What could have been different',
      'Risks and unknowns', 'Lifecycle', 'Outlook and what to watch',
      'Key metrics', 'Evidence and sources',
    ];
    let cursor = -1;
    for (const label of labels) {
      const next = output.indexOf(label);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
  });

  it('keeps all ten headings visible and uses short human copy for missing research', () => {
    const { canonicalProfileHtml } = profileRenderer();
    const fixture = structuredClone(ENTITY_PROFILE_BROWSER_FIXTURES.dex);
    fixture.analysis.sections.strategic_choices.body = null;
    fixture.analysis.sections.lifecycle.body = null;
    fixture.sources = [];
    const output = canonicalProfileHtml(fixture);

    expect(output).toContain('data-profile-section="strategic_choices" data-profile-section-missing="true"');
    expect(output).toContain('data-profile-section="lifecycle" data-profile-section-missing="true"');
    expect(output).toContain('The choices behind this outcome have not been verified yet.');
    expect(output).toContain('We do not have a current, dated lifecycle record for this profile yet.');
    expect(output).toContain('No verified sources are published for this profile yet.');
    expect(output).not.toContain('data-profile-research-gaps="true"');
  });

  it('treats database missing-value sentinels as research gaps, not customer copy', () => {
    const { canonicalProfileHtml } = profileRenderer();
    const fixture = structuredClone(ENTITY_PROFILE_BROWSER_FIXTURES.dex);
    fixture.analysis.sections.token_and_value_capture.body = 'unresolved';
    const output = canonicalProfileHtml(fixture);

    expect(output).toContain('data-profile-section="token_and_value_capture" data-profile-section-missing="true"');
    expect(output).not.toContain('>unresolved<');
    expect(output).toContain('The token and value-capture model has not been verified yet.');
  });

  it('renders the exact ten-section report template for every entity family', () => {
    const { canonicalProfileHtml } = profileRenderer();
    for (const fixture of Object.values(ENTITY_PROFILE_BROWSER_FIXTURES)) {
      const thin = structuredClone(fixture);
      thin.analysis.sections.strategic_choices.body = null;
      thin.analysis.sections.lifecycle.body = 'unknown';
      const output = canonicalProfileHtml(thin);
      for (const [key] of [
        ['what_it_is'], ['what_happened'], ['why_this_outcome'], ['strategic_choices'],
        ['operating_model'], ['token_and_value_capture'], ['counterfactual'],
        ['risks_and_unknowns'], ['lifecycle'], ['outlook_and_watch'],
      ]) {
        expect(output, `${thin.identity.type}:${key}`).toContain(`data-profile-section="${key}"`);
      }
    }
  });

  it('wires the canonical page route and maps every legacy report URL into it', () => {
    expect(worker).toContain("app.get('/profile/:entity_type/:slug'");
    expect(html).toContain("seg === 'profile'");
    expect(html).toContain("openProfile('blockchain', decodeURIComponent(rest), { replace:true");
    expect(html).toContain("openProfile('nft_collection', decodeURIComponent(rest), { replace:true, fallbackType:'ordinals_collection'");
    expect(html).toContain("openProfile('web3_casino', decodeURIComponent(rest), { replace:true");
    expect(html).toContain("openProfile(decodeURIComponent(rest), decodeURIComponent(fourth), { replace:true");
  });

  it('ships responsive and keyboard-focus behavior for the dedicated report surface', () => {
    expect(html).toContain('@media(max-width:760px)');
    expect(html).toContain('.profile-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }');
    expect(html).toContain('id="profileTitle" tabindex="-1"');
    expect(html).toContain("title.focus({ preventScroll:true })");
    expect(html).toContain("event.target.closest('a[data-profile-type][data-profile-slug]')");
    expect(html).toContain('.profile-page { max-width:1040px; margin:0 auto; min-width:0; }');
    expect(html).toContain('.profile-report .gbody { font-size:14px; line-height:1.72; color:var(--text); overflow-wrap:anywhere; }');
    expect(html).toContain('.profile-source a { color:var(--accent2); font-size:13px; line-height:1.45; min-width:0; overflow-wrap:anywhere; }');
  });
});

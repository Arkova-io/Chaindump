import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

describe('public UI/UX audit guards', () => {
  it('keeps the mobile Top 50 rank marker inside the viewport', () => {
    expect(html).toContain('td.rank{ position:absolute; opacity:.5; padding:6px 10px; width:36px !important; }');
  });

  it('forces report grids and card headers to fit a 390px viewport', () => {
    expect(html).toContain('.gwrap { display:grid; grid-template-columns:repeat(2,minmax(0,1fr));');
    expect(html).toContain('.gcard { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px 18px; min-width:0; overflow-wrap:anywhere; }');
    expect(html).toContain('.ghead > * { min-width:0; }');
    expect(html).toContain('.gwrap{grid-template-columns:minmax(0,1fr)}');
    expect(html).toContain('.ghead{flex-direction:column}');
    expect(html).toContain('.gdd{width:100%;text-align:left;white-space:normal}');
    expect(html).toContain('grid-template-columns:repeat(auto-fill,minmax(min(100%,270px),1fr))');
    expect(html).toContain('.watchrow { display:flex; align-items:baseline; gap:8px; min-width:0;');
    expect(html).toContain('.rlname a { display:block; max-width:100%;');
  });

  it('does not send Infrastructure profile back-links into a disabled route', () => {
    const disabledViews = html.match(/const DISABLED_VIEWS = new Set\(\[([^\]]*)\]\)/)?.[1] || '';
    expect(disabledViews).not.toContain("'infra'");
    expect(html).toContain('<button class="tab" data-view="infra">Storage / Verify</button>');
  });

  it('uses semantic headings and honest depth labels on public category pages', () => {
    expect(html).toContain('<h2 class="pagetitle">${esc(title)}</h2>');
    expect(html).toContain("gstat(data.collections.length, 'published project reports')");
    expect(html).toContain("gstat(data.count || 0, 'research reports')");
    expect(html).not.toContain("gstat(data.collections.length, 'in-depth case studies')");
    expect(html).not.toContain("gstat(data.count || 0, 'in-depth case studies')");
  });

  it('explains unclassified NFT outcomes in reader language', () => {
    expect(html).toContain("{ unknown: 'outcome still under review' }");
    expect(html).toContain('Some are deep lifecycle studies; others remain partial');
  });

  it('tells readers when a live profile needs a fresh observation', () => {
    expect(html).toContain('Evidence needs a fresh check · last observed');
    expect(html).toContain("freshnessState === 'stale' || freshnessState === 'review_due'");
  });

  it('writes incomplete report sections as a readable sentence', () => {
    expect(html).toContain('strategic_choices: "The choices behind this outcome have not been verified yet."');
    expect(html).toContain('operating_model: "The operating model has not been verified yet."');
    expect(html).toContain('counterfactual: "There is not enough evidence yet to say what might have changed the outcome."');
    expect(html).toContain('data-profile-section-missing="true"');
  });

  it('keeps in-page report shortcuts on their current SPA route', () => {
    // The document has <base href="/">, so bare #fragment links resolve to the
    // home route and strand readers on Live Top 50. Route-qualified fragments
    // preserve the current analysis page and scroll to its results.
    expect(html).toContain('href="/blockchain-analysis#blockchain-analysis-reports"');
    expect(html).toContain('href="/exchange-analysis#exchange-analysis-reports"');
    expect(html).toContain('href="/exchange-analysis#exchange-analysis-patterns"');
    expect(html).toContain('href="/casino-analysis#casino-analysis-reports"');
    expect(html).toContain('href="/nft-analysis#nft-analysis-reports"');
    expect(html).toContain('href="/nft-analysis#nftcatalog"');
    expect(html).not.toMatch(/href="#(?:blockchain|exchange|casino|nft)/);
  });
});

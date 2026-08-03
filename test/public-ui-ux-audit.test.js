import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

describe('public UI/UX audit guards', () => {
  it('keeps the mobile Top 50 rank marker inside the viewport', () => {
    expect(html).toContain('td.rank{ position:absolute; opacity:.5; padding:6px 10px; width:36px !important; }');
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
    expect(html).toContain("strategic_choices:'strategic choices'");
    expect(html).toContain("operating_model:'operating model'");
    expect(html).toContain("counterfactual:'what could have been different'");
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

describe('mobile navigation density', () => {
  it('uses one horizontally scrollable row instead of a multi-row chip cloud', () => {
    const mobile = html.slice(
      html.indexOf('@media(max-width:900px){', html.indexOf('.tabs { position:fixed')),
      html.indexOf('.gvintro', html.indexOf('@media(max-width:900px){', html.indexOf('.tabs { position:fixed'))),
    );
    expect(mobile).toContain('flex-wrap:nowrap');
    expect(mobile).toContain('overflow-x:auto');
    expect(mobile).toContain('position:sticky');
    expect(mobile).toContain('.tab { flex:0 0 auto');
    expect(mobile).not.toContain('flex-wrap:wrap');
  });

  it('reveals an off-screen active tab without changing vertical scroll', () => {
    const start = html.indexOf('function keepActiveNavVisible(activeTab)');
    const end = html.indexOf('// Hide the nav entries', start);
    const source = html.slice(start, end);
    expect(source).toContain('nav.scrollLeft =');
    expect(source).not.toContain('scrollIntoView');
    expect(source).not.toMatch(/scrollTop|scrollY|scrollTo\s*\(/);
    expect(html).toContain('keepActiveNavVisible(document.querySelector');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function block(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`missing copy block: ${start}`);
  return html.slice(from, to);
}

describe('customer-facing copy stays reader-first', () => {
  it('uses human language for the shared refresh header', () => {
    const copy = block('function forensicsScanText()', 'async function loadForensicsRefreshStatus()');
    expect(copy).toContain('Report freshness (every 6 hours)');
    expect(copy).toContain('Optional research updates');
    expect(copy).toContain('a reviewer approves any changes');
    expect(copy).not.toContain('Research assistant:');
    expect(copy).not.toContain('suggestions only');
  });

  it('keeps internal trend and training vocabulary out of the visible trend panel', () => {
    const copy = block('function trendTaxonomyPanel(domains, title)', 'function rerenderActiveForensicsView()');
    expect(copy).toContain('Every report includes');
    expect(copy).toContain('What we watch');
    expect(copy).toContain('When we call a trend');
    expect(copy).not.toContain('Sections required');
    expect(copy).not.toContain('See the training format');
    expect(copy).not.toContain('Guide version');
    expect(copy).not.toContain('evidence fields required');
  });

  it('explains evidence holds without internal publication-depth jargon', () => {
    const copy = block('function publicationDepthBanner(depth, corpusLabel = \'Corpus inclusion\')', 'function publicationDepthSectionHtml');
    expect(copy).toContain('Evidence review:');
    expect(copy).toContain('still being checked or held back');
    expect(copy).not.toContain('Independent support:');
    expect(copy).not.toContain('pending / withheld');
  });
});

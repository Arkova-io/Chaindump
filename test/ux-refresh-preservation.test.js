import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

describe('background refresh UX contract', () => {
  it('centralizes viewport and control restoration around live-board renders', () => {
    expect(html).toContain('function captureUiSnapshot()');
    expect(html).toContain('function restoreUiSnapshot(snapshot)');
    expect(html).toContain('function refreshWithUiPreservation(task)');
    expect(html).toContain('try { return renderBoard(); }');
    expect(html).toContain('finally { restoreUiSnapshot(snapshot); }');
  });

  it('refreshes populated live views in place instead of replacing them with a skeleton', () => {
    expect(html).toContain("if (!state.nftData) document.getElementById('nftview').innerHTML");
    expect(html).toContain("if (!state.marketsData) document.getElementById('marketsview').innerHTML");
    expect(html).toContain("if (!state.stablesData) document.getElementById('stablesview').innerHTML");
    expect(html).toContain("if (!state.newsData) document.getElementById('newsview').innerHTML");
    expect(html).toContain("if (!state.powerData) document.getElementById('powerview').innerHTML");
  });

  it('routes the sixty-second live refresh through the preservation wrapper', () => {
    const timer = html.slice(html.lastIndexOf('const LIVE_REFRESH'));
    expect(timer).toContain('refreshWithUiPreservation(fn);');
    expect(timer).not.toContain('window.scrollTo(0, y)');
  });

  it('preserves focus when asynchronous taxonomy and catalog renders replace controls', () => {
    expect(html).toContain('function rerenderActiveForensicsView()');
    expect(html).toContain('function renderCatalogBody()');
    expect(html).toContain('function renderCatalog()');
    expect(html).toContain('document.addEventListener(\'change\', preserveControlAfterEvent, true);');
    expect(html).toContain('document.addEventListener(\'input\', preserveControlAfterEvent, true);');
  });

  it('does not remount the traces page on every route visit', () => {
    expect(html).toContain('if (state.tracesData) renderTraces(state.tracesData);');
    expect(html).toContain('if (!state.tracesData) document.getElementById(\'tracesview\').innerHTML');
  });
});

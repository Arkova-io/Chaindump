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

  it('routes the global thirty-second board refresh through the preservation wrapper', () => {
    const startup = html.slice(html.lastIndexOf('\nload();'));
    expect(startup).toContain('load();');
    expect(startup).toContain('setInterval(() => refreshWithUiPreservation(load), 30000);');
    expect(startup).not.toContain('setInterval(load, 30000);');
  });

  it('preserves focus when catalog and filter renders replace controls', () => {
    expect(html).toContain('function renderCatalogBody()');
    expect(html).toContain('function renderCatalog()');
    expect(html).toContain('document.addEventListener(\'change\', preserveControlAfterEvent, true);');
    expect(html).toContain('document.addEventListener(\'input\', preserveControlAfterEvent, true);');
  });

  it('restores a focused profile link and an open panel after DOM replacement', () => {
    const start = html.indexOf('function captureUiSnapshot()');
    const end = html.indexOf('const fmtUsd', start);
    const functions = html.slice(start, end);
    const body = {};
    const oldLink = {
      id: '',
      dataset: { profileType: 'blockchain', profileSlug: 'ethereum' },
    };
    const oldPanel = { dataset: { uiKey: 'accordion-report' } };
    const newToggle = { textContent: 'Show full ▾' };
    const newPanel = {
      dataset: { uiKey: 'accordion-report' },
      opened: false,
      classList: { add() { newPanel.opened = true; } },
      querySelector() { return newToggle; },
    };
    const document = {
      body,
      activeElement: oldLink,
      getElementById() { return null; },
      querySelectorAll(selector) {
        if (selector.includes('.acc.open')) return [oldPanel];
        if (selector === '.acc[data-ui-key], .prosebox[data-ui-key]') return [newPanel];
        return [newLink];
      },
    };
    const newLink = {
      dataset: { profileType: 'blockchain', profileSlug: 'ethereum' },
      focus() { document.activeElement = newLink; },
    };
    const scrolled = [];
    const window = {
      scrollX: 12,
      scrollY: 480,
      scrollTo(value) { scrolled.push(value); },
    };
    const state = { activeView: 'blockchain-analysis' };
    const api = new Function('state', 'document', 'window', `${functions}; return { captureUiSnapshot, restoreUiSnapshot };`)(state, document, window);

    const snapshot = api.captureUiSnapshot();
    document.activeElement = body;
    api.restoreUiSnapshot(snapshot);

    expect(scrolled).toEqual([{ left: 12, top: 480, behavior: 'auto' }]);
    expect(document.activeElement).toBe(newLink);
    expect(newPanel.opened).toBe(true);
    expect(newToggle.textContent).toBe('Show less ▲');
  });

  it('does not remount the traces page on every route visit', () => {
    expect(html).toContain('if (state.tracesData) renderTraces(state.tracesData);');
    expect(html).toContain('if (!state.tracesData) document.getElementById(\'tracesview\').innerHTML');
  });
});

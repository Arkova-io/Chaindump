import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_DOSSIER_SECTIONS,
  NORMALIZED_DOSSIER_VERSION,
  normalizeDossier,
  validateDossier,
} from '../src/lib/normalized-dossier.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

describe('normalized cross-vertical dossier template', () => {
  it('defines one stable section order with explicit unknown-safe values', () => {
    expect(NORMALIZED_DOSSIER_SECTIONS.map(([key]) => key)).toEqual([
      'what_it_is', 'what_happened', 'why', 'strategic_choices',
      'operating_model', 'token_value_capture', 'evidence', 'counterfactual',
      'risks_unknowns', 'lifecycle', 'outlook_watch', 'review_metadata',
    ]);
    const dossier = normalizeDossier({ category: 'dex', name: 'Example' });
    expect(dossier.schema).toBe(NORMALIZED_DOSSIER_VERSION);
    expect(validateDossier(dossier)).toEqual([]);
    expect(dossier.sections.why).toBeNull();
  });

  it('renders the same normalized template for every core forensic vertical', () => {
    expect(html).toContain('data-normalized-dossier="v1"');
    expect(html).toContain("['what_it_is', 'What it is']");
    expect(html).toContain("['review_metadata', 'Review metadata']");
    expect(html).toContain('data-normalized-section="${key}"');
    expect(html).toContain('function normalizedDossierHtml(input = {})');
    expect(html).toContain('const normalized = normalizedDossierHtml({');
    expect(html).toContain("category: 'Blockchain'");
    expect(html).toContain('category: `${String(row.kind || \'exchange\').toUpperCase()}');
    expect(html).toContain('category: `Web3 casino · ${casinoLabel(item.product_subtype)}`');
    expect(html).toContain('category: `NFT / Ordinals · ${chainLabel(c.chain)}`');
  });

  it('keeps evidence and unknowns visible instead of silently dropping them', () => {
    expect(html).toContain('Unknown / not published for this report');
    expect(html).toContain('function normalizedSourceLedger(sources)');
    expect(html).toContain('source coverage does not by itself prove every conclusion');
  });

  it('renders nested report data as human rows and never as recursive key-value prose', () => {
    expect(html).toContain('function normalizedStructuredHtml(value');
    expect(html).toContain('function normalizedText(value)');
    expect(html).toContain('const NORMALIZED_HIDDEN_KEYS');
    expect(html).not.toContain('`${key.replaceAll(\'_\', \' \')}: ${normalizedValue(item)}`');
    expect(html).not.toContain('${normalizedValue(values[key]) ? proseBox(normalizedValue(values[key])) : \'\'}');
    expect(html).toContain("if (key === 'evidence') return");
    expect(html).toContain('normalizedSourceLedger(d.sources)');
  });
});

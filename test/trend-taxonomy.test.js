import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  REGULATORY_SIGNALS,
  TREND_CATEGORIES,
  slmTrainingSchemaPayload,
  trendTaxonomyPayload,
  validateTrendIds,
} from '../src/lib/trend-taxonomy.js';

function ctx() {
  return { waitUntil() {}, passThroughOnException() {} };
}

describe('trend taxonomy', () => {
  it('keeps every regulatory signal mapped to declared trend categories', () => {
    const categoryIds = new Set(TREND_CATEGORIES.map((category) => category.id));

    expect(TREND_CATEGORIES.length).toBeGreaterThanOrEqual(10);
    for (const signal of REGULATORY_SIGNALS) {
      expect(signal.source_refs[0].url).toMatch(/^https:\/\//);
      expect(signal.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(categoryIds.has(signal.driver_domain)).toBe(true);
    }
  });

  it('validates trend ids without accepting unknown labels', () => {
    expect(validateTrendIds(['distribution', 'regulation_compliance'])).toEqual({
      ok: true,
      unknown: [],
    });
    expect(validateTrendIds(['distribution', 'made_up_driver'])).toEqual({
      ok: false,
      unknown: ['made_up_driver'],
    });
  });

  it('publishes the evidence contract and SLM schema together', () => {
    const taxonomy = trendTaxonomyPayload();
    const schema = slmTrainingSchemaPayload();

    expect(taxonomy.schema).toBe('trend-taxonomy-v1');
    expect(taxonomy.canonical_schema).toBe('chaindump-trend-taxonomy-v1');
    expect(taxonomy.driver_domains.length).toBeGreaterThanOrEqual(10);
    expect(taxonomy.outlook_contract.required_fields).toContain('supporting_signal_ids');
    expect(schema.required_record_fields).toContain('unknowns');
    expect(schema.taxonomy_schema).toBe(taxonomy.schema);
    expect(schema.required_record_fields).toContain('last_reviewed_at');
    expect(schema.quality_gates.join(' ')).toContain('withheld high-risk conclusions');
    expect(taxonomy.human_intelligence_guide.canonical_format).toHaveLength(5);
    expect(taxonomy.human_intelligence_guide.verticals.dex).toMatch(/real traders/i);
    expect(schema.human_intelligence_guide.verticals.nft_ordinals).toMatch(/lasting holders/i);
  });

  it('exposes taxonomy and SLM endpoints without requiring D1', async () => {
    vi.resetModules();
    const worker = (await import('../src/worker.js')).default;

    const taxonomyResponse = await worker.fetch(
      new Request('http://localhost/api/trend-taxonomy'),
      {},
      ctx(),
    );
    const schemaResponse = await worker.fetch(
      new Request('http://localhost/api/slm/training-schema'),
      {},
      ctx(),
    );

    expect(taxonomyResponse.status).toBe(200);
    expect(schemaResponse.status).toBe(200);
    expect((await taxonomyResponse.json()).regulatory_signals.length).toBeGreaterThanOrEqual(4);
    expect((await schemaResponse.json()).label_targets).toContain('trend_ids');
  });

  it('surfaces trend taxonomy and SLM export links in every forensic analysis UI', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

    expect(html).toContain("trendTaxonomyPanel('blockchain'");
    expect(html).toContain("trendTaxonomyPanel(['dex', 'cex']");
    expect(html).toContain("trendTaxonomyPanel('casino'");
    expect(html).toContain("trendTaxonomyPanel('nft_ordinals'");
    expect(html).toContain('/api/trend-taxonomy');
    expect(html).toContain('/api/slm/training-schema');
  });
});

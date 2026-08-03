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
    expect(taxonomy.summary.trend_categories).toBeGreaterThan(taxonomy.summary.driver_domains);
    expect(taxonomy.summary.vertical_outlook_refresh_contracts).toBeGreaterThanOrEqual(10);
    expect(taxonomy.outlook_contract.required_fields).toContain('supporting_signal_ids');
    expect(taxonomy.outlook_contract.required_fields).toContain('change_summary');
    expect(taxonomy.refreshed_outlook_guide.trend_promotion_policy.minimum_comparable_observations).toBe(3);
    expect(taxonomy.refreshed_outlook_guide.vertical_refresh_fields.dex).toContain('retained_trader_activity');
    expect(schema.required_record_fields).toContain('unknowns');
    expect(schema.required_record_fields).toContain('metric_contract');
    expect(schema.required_record_fields).toContain('human_review_status');
    expect(schema.taxonomy_schema).toBe(taxonomy.schema);
    expect(schema.required_record_fields).toContain('last_reviewed_at');
    expect(schema.quality_gates.join(' ')).toContain('withheld high-risk conclusions');
    expect(schema.quality_gates.join(' ')).toContain('three comparable dated observations');
    expect(taxonomy.human_intelligence_guide.canonical_format).toHaveLength(5);
    expect(taxonomy.human_intelligence_guide.verticals.dex).toMatch(/real traders/i);
    expect(schema.label_targets).toContain('refreshed_outlook_delta');
    expect(schema.slm_label_contract.evidence_sufficiency_labels).toContain('not_comparable');
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

  it('keeps machine schemas out of category pages and explains the method in its own view', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

    expect(html).toContain('data-view="methodology">Intelligence Methodology</button>');
    expect(html).toContain('id="methodologyview"');
    expect(html).toContain("pageHead('Intelligence Methodology'");
    expect(html).toContain('How to read a report');
    expect(html).toContain('How evidence works');
    expect(html).toContain('How comparisons work');
    expect(html).toContain('What we look for by category');
    expect(html).not.toContain('function trendTaxonomyPanel(');
    expect(html).not.toContain('/api/trend-taxonomy"');
    expect(html).not.toContain('/api/slm/training-schema"');
  });
});

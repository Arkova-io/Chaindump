import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYSIS_SECTION_KEYS,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';

function openCorpus() {
  const database = new DatabaseSync(':memory:');
  const files = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  return database;
}

function d1Adapter(database) {
  return {
    prepare(sql) {
      let bindings = [];
      return {
        bind(...values) {
          bindings = values;
          return this;
        },
        async all() {
          return { results: database.prepare(sql).all(...bindings) };
        },
        async first() {
          return database.prepare(sql).get(...bindings) ?? null;
        },
      };
    },
  };
}

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
let database;

afterEach(() => {
  database?.close();
  database = undefined;
  vi.unstubAllGlobals();
});

describe('canonical Web3 casino route census', () => {
  it('gives every published casino its own structurally valid reusable profile', async () => {
    database = openCorpus();
    const worker = await freshWorker();
    const env = { DB: d1Adapter(database) };
    const rows = database.prepare(`
      SELECT case_id, brand_name
      FROM casino_cases
      WHERE quality_passed = 1
      ORDER BY case_id
    `).all();
    expect(rows).toHaveLength(29);
    const coverage = [];

    for (const row of rows) {
      const response = await worker.fetch(
        new Request(`http://localhost/api/profile/web3_casino/${row.case_id}`),
        env,
        ctx(),
      );
      expect(response.status, row.case_id).toBe(200);
      const profile = await response.json();
      expect(profile.identity).toMatchObject({
        id: `web3_casino:${row.case_id}`,
        type: 'web3_casino',
        slug: row.case_id,
      });
      expect(profile.identity.name.toLowerCase()).toBe(row.brand_name.toLowerCase());
      expect(Object.keys(profile.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
      expect(validateEntityProfile(profile), row.case_id).toEqual([]);
      expect(profile.quality.publication_state, row.case_id).toBe('review');
      expect(profile.extensions).not.toHaveProperty('structured_analysis');
      const renderedBodies = Object.values(profile.analysis.sections)
        .map(({ body }) => body)
        .filter(Boolean);
      coverage.push([
        row.case_id,
        renderedBodies.length,
        Object.entries(profile.analysis.sections)
          .filter(([, section]) => !section.body)
          .map(([key]) => key),
      ]);
      expect(renderedBodies.length, row.case_id).toBeGreaterThan(0);
      expect(renderedBodies.join(' '), row.case_id).not.toContain('[object Object]');
    }
    expect(coverage).toEqual(rows.map(({ case_id: caseId }) => [caseId, 10, []]));
  });
});

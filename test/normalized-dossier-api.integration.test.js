import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_DOSSIER_SECTIONS,
  NORMALIZED_DOSSIER_VERSION,
  normalizeDossier,
  validateDossier,
} from '../src/lib/normalized-dossier.js';

const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

describe('server normalized dossier contract', () => {
  it('creates a complete stable envelope while retaining explicit null sections', () => {
    const dossier = normalizeDossier({ category: 'dex', name: 'Example', status: 'unknown' });
    expect(dossier.schema).toBe(NORMALIZED_DOSSIER_VERSION);
    expect(Object.keys(dossier.sections)).toEqual(NORMALIZED_DOSSIER_SECTIONS.map(([key]) => key));
    expect(dossier.sections.why).toBeNull();
    expect(validateDossier(dossier)).toEqual([]);
  });

  it('emits normalized_dossier at each core analysis API boundary', () => {
    expect(worker).toContain("import { normalizeDossier } from './lib/normalized-dossier.js';");
    expect(worker).toContain('normalized_dossier: normalizedExchangeDossier');
    expect(worker).toContain('normalized_dossier: normalizedNftDossier');
    expect(worker).toContain('result.normalized_dossier = normalizedCasinoDossier');
    expect(worker).toContain('normalized_dossier: normalizedChainDossier');
  });

  it('builds projections only after public redaction helpers', () => {
    expect(worker.indexOf('const publicProfile = publicExchangeProfile')).toBeLessThan(worker.indexOf('normalized_dossier: normalizedExchangeDossier'));
    expect(worker.indexOf('const publicProfile = publicNftProfile')).toBeLessThan(worker.indexOf('normalized_dossier: normalizedNftDossier'));
    expect(worker.indexOf('const publicSynthesis = publicCasinoSynthesis')).toBeLessThan(worker.indexOf('publicCase.normalized_dossier = normalizedCasinoDossier'));
  });

  it('does not reintroduce an exchange lifecycle when public outcome is withheld', () => {
    expect(worker).toContain('status: row.status ?? null');
    expect(worker).toContain('lifecycle: profile?.synthesis || row.status || null');
    expect(worker).not.toContain('status: row.status || row.lifecycle');
    expect(worker).not.toContain('lifecycle: profile?.synthesis || row.lifecycle');
  });
});

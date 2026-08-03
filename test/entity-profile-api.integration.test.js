import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

describe('canonical entity profile API', () => {
  it('exposes one read-only profile route and a machine-readable contract', () => {
    expect(worker).toContain("app.get('/api/profile-contract'");
    expect(worker).toContain("app.get('/api/profile/:entity_type/:slug'");
    expect(worker).toContain('entityProfileContract()');
  });

  it('routes every required entity type through explicit current-table adapters', () => {
    for (const type of [
      'blockchain', 'dex', 'cex', 'nft_collection', 'ordinals_collection',
      'web3_casino', 'stablecoin', 'rwa', 'depin', 'infrastructure_network',
      'crypto_treasury', 'miner', 'etf',
    ]) {
      expect(worker).toContain(`case '${type}':`);
    }
    expect(worker).toContain('resolveEntityProfile(entityType, slug)');
  });

  it('uses bound parameters, strict enum/slug validation, and 404 for missing entities', () => {
    expect(worker).toContain('PROFILE_ENTITY_TYPES.has(entityType)');
    expect(worker).toContain("/^[a-z0-9._-]+$/");
    expect(worker).toContain("res.status(404).json({ error: 'profile not found' })");
    expect(worker).toContain('WHERE lower(slug) = ?');
    expect(worker).not.toContain('WHERE lower(slug) = ${');
  });
});

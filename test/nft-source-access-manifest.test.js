import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const manifest = readFileSync(
  new URL('../docs/nft-source-access-remediation-2026-07-29.md', import.meta.url),
  'utf8',
);
const rows = manifest.split('\n').filter((line) => /^\| [a-z0-9]/.test(line));

function count(column, value) {
  return rows.filter((line) => line.split('|').map((cell) => cell.trim())[column] === value).length;
}

describe('NFT source-access remediation manifest', () => {
  it('accounts for every source that began without a recorded access state', () => {
    expect(rows).toHaveLength(198);
    expect(count(3, 'accessible')).toBe(171);
    expect(count(3, 'bot_blocked')).toBe(21);
    expect(count(3, 'unverified')).toBe(5);
    expect(count(3, 'dead')).toBe(1);
  });

  it('keeps access checks separate from claim verification', () => {
    expect(manifest).toContain('source-access remediation, not blanket claim verification');
    expect(manifest).toContain('retrieval states remain distinct');
    expect(manifest).toContain('rendered and integrated as contiguous migration 0064');
    expect(manifest).toContain('does not prove the cited claim');
    expect(manifest).toContain('were not treated as proof of successful access');
    expect(rows.every((line) => line.startsWith('| ') && line.endsWith(' |'))).toBe(true);
  });
});

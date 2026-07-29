import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync(
  new URL('../.sonarcloud.properties', import.meta.url),
  'utf8',
);

describe('SonarCloud Automatic Analysis bootstrap', () => {
  it('excludes only the three generated payload migrations from issue analysis', () => {
    expect(config.match(/^sonar\.exclusions=(.+)$/m)?.[1].split(',')).toEqual([
      'migrations/0062_chain_causal_completion.sql',
      'migrations/0063_publication_depth_wave_a.sql',
      'migrations/0064_nft_source_access_remediation.sql',
    ]);
    expect(config).not.toMatch(
      /^sonar\.exclusions=.*(?:\*|scripts|src|test|docs)/m,
    );
  });

  it('keeps copy/paste exclusions separate from issue analysis', () => {
    const cpdExclusions = config.match(/^sonar\.cpd\.exclusions=(.+)$/m)?.[1];

    expect(cpdExclusions?.split(',')).toEqual([
      'migrations/0057_nft_forensic_wave_a.sql',
      'migrations/0058_nft_forensic_normalization.sql',
      'migrations/0059_exchange_forensic_wave_a.sql',
      'migrations/0060_exchange_cex_causal_wave_b.sql',
      'scripts/render-nft-forensic-wave-a-migration.mjs',
      'scripts/render-exchange-forensic-wave-a-migration.mjs',
      'scripts/render-exchange-cex-causal-wave-b-migration.mjs',
      'scripts/render-chain-causal-completion-migration.mjs',
      'scripts/render-publication-depth-wave-a-migration.mjs',
      'scripts/render-nft-source-access-remediation-migration.mjs',
    ]);
    expect(cpdExclusions).not.toContain('*');
  });
});

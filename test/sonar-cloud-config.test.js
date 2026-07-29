import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync(
  new URL('../.sonarcloud.properties', import.meta.url),
  'utf8',
);

describe('SonarCloud Automatic Analysis bootstrap', () => {
  it('excludes only the two generated payload migrations from issue analysis', () => {
    expect(config.match(/^sonar\.exclusions=(.+)$/m)?.[1].split(',')).toEqual([
      'migrations/0062_chain_causal_completion.sql',
      'migrations/0064_nft_source_access_remediation.sql',
    ]);
    expect(config).not.toMatch(
      /^sonar\.exclusions=.*(?:\*|scripts|src|test|docs)/m,
    );
  });

  it('keeps copy/paste exclusions separate from issue analysis', () => {
    const cpdExclusions = config.match(/^sonar\.cpd\.exclusions=(.+)$/m)?.[1];

    expect(cpdExclusions).toBeTruthy();
    expect(cpdExclusions?.split(',')).toContain(
      'scripts/render-chain-causal-completion-migration.mjs',
    );
    expect(cpdExclusions?.split(',')).toContain(
      'scripts/render-nft-source-access-remediation-migration.mjs',
    );
    expect(cpdExclusions).not.toContain('*');
  });
});

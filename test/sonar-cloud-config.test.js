import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync(
  new URL('../.sonarcloud.properties', import.meta.url),
  'utf8',
);

describe('SonarCloud Automatic Analysis bootstrap', () => {
  it('excludes only generated migration 0062 from issue analysis', () => {
    expect(config).toContain(
      'sonar.exclusions=migrations/0062_chain_causal_completion.sql',
    );
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
    expect(cpdExclusions).not.toContain('*');
    expect(config).not.toContain(
      'sonar.exclusions=migrations/0062_chain_causal_completion.sql,',
    );
  });
});

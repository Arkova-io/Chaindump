import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const criterion = [
  'sonar.issue.ignore.multicriteria=generatedMigrationSqlLiterals',
  'sonar.issue.ignore.multicriteria.generatedMigrationSqlLiterals.ruleKey=plsql:S1192',
  'sonar.issue.ignore.multicriteria.generatedMigrationSqlLiterals.resourceKey=migrations/0062_chain_causal_completion.sql',
];

describe('Sonar generated-migration issue scope', () => {
  for (const configName of ['sonar-project.properties', '.sonarcloud.properties']) {
    it(`limits the ${configName} issue exception to SQL literal duplication`, () => {
      const config = readFileSync(new URL(configName, root), 'utf8');

      for (const property of criterion) expect(config).toContain(property);
      expect(config).not.toMatch(/sonar\.exclusions=.*migrations/);
      expect(config).not.toMatch(
        /sonar\.issue\.ignore\.allfile=.*migrations/,
      );
      expect(config).not.toContain(
        'sonar.issue.ignore.multicriteria.generatedMigrationSqlLiterals.resourceKey=migrations/**/*.sql',
      );
    });
  }

  it('excludes migration 0062 from copy/paste density in Automatic Analysis', () => {
    const config = readFileSync(new URL('.sonarcloud.properties', root), 'utf8');

    expect(config).toContain(
      'sonar.cpd.exclusions='
        + 'migrations/0057_nft_forensic_wave_a.sql,'
        + 'migrations/0058_nft_forensic_normalization.sql,'
        + 'migrations/0059_exchange_forensic_wave_a.sql,'
        + 'migrations/0060_exchange_cex_causal_wave_b.sql,'
        + 'migrations/0062_chain_causal_completion.sql,',
    );
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const criterion = [
  'sonar.issue.ignore.multicriteria=generatedMigrationSqlLiterals',
  'sonar.issue.ignore.multicriteria.generatedMigrationSqlLiterals.ruleKey=plsql:S1192',
  'sonar.issue.ignore.multicriteria.generatedMigrationSqlLiterals.resourceKey=migrations/**/*.sql',
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
    });
  }
});

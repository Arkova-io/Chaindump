export const CASINO_PUBLICATION_COHORT_ID = 'web3-casino-full-corpus-2026-07-29';
export const CASINO_PUBLICATION_COHORT_AS_OF = '2026-07-29';

// This is the durable publication denominator. It must not be derived from the
// rows that happen to exist in casino_cases: a deleted dossier is missing, not
// evidence that the research universe silently became smaller.
export const CASINO_PUBLICATION_CASE_IDS = Object.freeze([
  'augur-protocol-reboot',
  'azuro',
  'bc-game-curacao-small-house',
  'betfury-bfg-ecosystem',
  'betswirl-onchain-casino',
  'bitcasino-dot-io',
  'bitstarz-dot-com',
  'bustabit',
  'cloudbet-dot-com',
  'coinpoker-dot-com',
  'decentral-games-poker-arcade',
  'duelbits-dot-com',
  'etheroll-dice-game',
  'funfair-b2b-platform',
  'kingtiger-casino',
  'overtime',
  'polymarket-international',
  'purebet-solana-exchange',
  'rollbit-dot-com',
  'roobet-dot-com',
  'shuffle-dot-com',
  'sportsbet-dot-io',
  'stake-dot-com',
  'sx-bet',
  'virtue-poker-consumer-platform',
  'wagerr-consumer-sportsbook',
  'wink-gaming-platform',
  'winr-protocol-bankroll',
  'zkasino-alleged-platform',
]);

export function casinoPublicationCoverageSql() {
  const expectedRows = CASINO_PUBLICATION_CASE_IDS
    .map((caseId) => `('${caseId}')`)
    .join(',\n        ');
  return `
    WITH expected(case_id) AS (
      VALUES ${expectedRows}
    )
    SELECT
      expected.case_id AS expected_case_id,
      cases.case_id AS present_case_id,
      cases.quality_passed,
      cases.selection_as_of,
      cases.updated_at
    FROM expected
    LEFT JOIN casino_cases AS cases USING (case_id)
    ORDER BY expected.case_id
  `;
}

export function summarizeCasinoPublicationCoverage(rowsValue) {
  const rowsById = new Map((Array.isArray(rowsValue) ? rowsValue : []).map((row) => [
    row.expected_case_id,
    row,
  ]));
  const expectedRows = CASINO_PUBLICATION_CASE_IDS.map((caseId) => (
    rowsById.get(caseId) || { expected_case_id: caseId, present_case_id: null }
  ));
  const present = expectedRows.filter(({ present_case_id: caseId }) => Boolean(caseId));
  const missingCaseIds = expectedRows
    .filter(({ present_case_id: caseId }) => !caseId)
    .map(({ expected_case_id: caseId }) => caseId);
  const dates = present
    .flatMap(({ updated_at: updatedAt }) => updatedAt ? [updatedAt] : [])
    .sort((left, right) => left.localeCompare(right));
  return {
    cohort_id: CASINO_PUBLICATION_COHORT_ID,
    universe_as_of: CASINO_PUBLICATION_COHORT_AS_OF,
    target_count: CASINO_PUBLICATION_CASE_IDS.length,
    present_count: present.length,
    quality_passed_count: present.filter(({ quality_passed: passed }) => Number(passed) === 1)
      .length,
    partial_count: present.filter(({ quality_passed: passed }) => Number(passed) !== 1).length,
    missing_count: missingCaseIds.length,
    missing_case_ids: missingCaseIds,
    methodology_version: 'casino-dossier-v1+forensic-analysis-v1',
    updated_at: dates.at(-1) || null,
  };
}

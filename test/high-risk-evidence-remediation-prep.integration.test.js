import { DatabaseSync } from 'node:sqlite';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import {
  applyRepositoryMigrations,
  buildHighRiskEvidenceRemediation,
  renderHighRiskEvidenceRemediationMigration,
} from '../scripts/render-high-risk-evidence-remediation-migration.mjs';

const documentUrl = new URL(
  '../docs/high-risk-evidence-remediation-2026-07-29.json',
  import.meta.url,
);
const rendererUrl = new URL(
  '../scripts/render-high-risk-evidence-remediation-migration.mjs',
  import.meta.url,
);
const document = JSON.parse(readFileSync(documentUrl, 'utf8'));

function createCorpus() {
  const database = new DatabaseSync(':memory:');
  applyRepositoryMigrations(database);
  return database;
}

function exchangeIdentity(entry) {
  const [, lifecycle, slug] = entry.dossier_id.split(':');
  const kind = entry.dossier_id.split(':')[0];
  const table = {
    dead: 'dead_exchanges',
    mid: 'mid_exchanges',
    successful: 'successful_exchanges',
  }[lifecycle];
  return {
    kind,
    lifecycle,
    slug,
    table,
    kindColumn: lifecycle === 'successful' ? 'type' : 'kind',
  };
}

function currentExchange(database, entry) {
  const target = exchangeIdentity(entry);
  return database.prepare(`
    SELECT profile, sources
    FROM ${target.table}
    WHERE ${target.kindColumn} = ? AND slug = ?
  `).get(target.kind, target.slug);
}

function casinoUnknowns(database, caseId) {
  const row = database.prepare(`
    SELECT outlook FROM casino_syntheses WHERE case_id = ?
  `).get(caseId);
  return JSON.parse(row.outlook).forensic_analysis.unknowns;
}

let database;

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('unnumbered high-risk evidence remediation preparation', () => {
  it('keeps the implementation unnumbered and preserves all twenty honest gaps', () => {
    expect(document.schema).toBe('chaindump-high-risk-remediation-implementation-v1');
    expect(document.status).toBe('implementation-prepared-no-migration-number-assigned');
    expect(document.migration_sequence).toMatchObject({
      assigned_id: null,
      reserved_after: '0064',
      rendered: false,
    });
    expect(document.cases).toHaveLength(10);
    expect(document.unresolved_claims).toHaveLength(20);
    expect(document.unresolved_claims.every(
      ({ publication_support: support }) => support === 'unresolved',
    )).toBe(true);
    expect(document.cases.reduce(
      (sum, entry) => sum + entry.remains_unresolved.length,
      0,
    )).toBe(20);
    expect(existsSync(new URL(
      '../migrations/0065_high_risk_evidence_remediation.sql',
      import.meta.url,
    ))).toBe(false);
  });

  it('publishes real source review, access, role, tier, and locator provenance', () => {
    const sources = document.cases.flatMap((entry) => entry.source_additions);
    expect(sources).toHaveLength(14);
    expect(sources.filter(({ access_state: state }) => state === 'accessible')).toHaveLength(10);
    expect(sources.filter(
      ({ access_state: state }) => state === 'bot_blocked_raw_fetch',
    )).toHaveLength(4);

    for (const source of sources) {
      expect(source.url || source.canonical_url).toMatch(/^https:\/\//);
      expect(source.source_tier).toBeTruthy();
      expect(source.source_role).toBeTruthy();
      expect(source.evidence_scope).toBeTruthy();
      expect(source.evidence_locator.length).toBeGreaterThan(30);
      expect(source.checked_at).toBe('2026-07-29');
      expect(source.last_verified_at).toBe('2026-07-29');
      expect(source.evidence_reviewed).toBe(true);
      expect(source.evidence_reviewer).toBe('codex-research-agent');
      expect(source.evidence_reviewed_at).toBe('2026-07-29');
      expect(source.access_checked_at).toBe('2026-07-29');
      expect(source.verification_note).toContain(source.evidence_locator);
    }
  });

  it('retains the adversarial boundaries instead of converting inference into fact', () => {
    const byId = Object.fromEntries(document.cases.map((entry) => [
      entry.dossier_id,
      entry,
    ]));
    expect(byId['dex:successful:aerodrome'].remains_unresolved.join(' '))
      .toMatch(/token\/emission mechanics|value distribution/);
    expect(byId['cex:dead:bitmart'].remains_unresolved.join(' '))
      .toContain('does not establish a causal connection');
    expect(byId['cex:successful:binance'].remains_unresolved.join(' '))
      .toMatch(/BNB contribution|proof-of-reserves/);
    expect(byId['cex:mid:htx'].remains_unresolved.join(' '))
      .toMatch(/venue-token utility|proof-of-reserves/);
    expect(byId['stake-dot-com'].casino_claim_additions[0].analyst_note)
      .toContain('Great Britain');
    expect(byId['stake-dot-com'].casino_claim_additions[0].analyst_note)
      .toContain('does not classify Stake globally');
    expect(byId['dex:mid:sushiswap'].source_additions.find(
      ({ id }) => id === 'sushi-certik-routeprocessor2',
    ).evidence_locator).toContain("outside CertiK's prior audit scope");
  });

  it('builds all ten patches while preserving every existing forensic unknown', () => {
    database = createCorpus();
    const exchangeCases = document.cases.filter(({ dossier_id: id }) => id.includes(':'));
    const casinoCases = document.cases.filter(({ dossier_id: id }) => !id.includes(':'));
    const exchangeUnknownsBefore = Object.fromEntries(exchangeCases.map((entry) => [
      entry.dossier_id,
      JSON.parse(currentExchange(database, entry).profile).forensic_analysis.unknowns,
    ]));
    const casinoUnknownsBefore = Object.fromEntries(casinoCases.map((entry) => [
      entry.dossier_id,
      casinoUnknowns(database, entry.dossier_id),
    ]));

    const state = buildHighRiskEvidenceRemediation(document, database);
    expect(state.exchange_rows).toHaveLength(6);
    expect(state.casino_rows).toHaveLength(4);

    for (const row of state.exchange_rows) {
      expect(row.profile.forensic_analysis.unknowns)
        .toEqual(exchangeUnknownsBefore[row.dossier_id]);
      const entry = exchangeCases.find(({ dossier_id: id }) => id === row.dossier_id);
      const registered = new Set(row.sources.flatMap((source) => [
        source.id,
        source.source_id,
        source.url,
        source.canonical_url,
      ]).filter(Boolean));
      for (const patch of entry.forensic_claim_patches || []) {
        for (const reference of patch.append_source_refs || []) {
          expect(registered.has(reference), `${entry.dossier_id}: ${reference}`).toBe(true);
        }
      }
    }
    for (const row of state.casino_rows) {
      expect(row.outlook.forensic_analysis.unknowns)
        .toEqual(casinoUnknownsBefore[row.case_id]);
    }
  });

  it('renders a bounded, replay-safe candidate and applies every UI-backed data patch', () => {
    database = createCorpus();
    const state = buildHighRiskEvidenceRemediation(document, database);
    const sql = renderHighRiskEvidenceRemediationMigration(document, state, '0065');
    const statements = unstable_splitSqlQuery(sql);

    expect(statements.length).toBeGreaterThan(10);
    expect(Math.max(...statements.map((statement) => Buffer.byteLength(statement))))
      .toBeLessThan(95_000);
    database.exec(sql);

    const sushi = database.prepare(`
      SELECT profile, sources
      FROM mid_exchanges
      WHERE kind = 'dex' AND slug = 'sushiswap'
    `).get();
    expect(JSON.parse(sushi.profile).forensic_analysis.why.source_refs)
      .toContain('https://www.banqueducanada.ca/wp-content/uploads/2024/07/sdp2024-12.pdf');
    expect(JSON.parse(sushi.sources).some(
      ({ id, evidence_reviewed: reviewed }) => (
        id === 'sushi-bank-of-canada-amm-ecology' && reviewed === true
      ),
    )).toBe(true);

    expect(database.prepare(`
      SELECT claim_type, support_direction
      FROM casino_claims
      WHERE claim_id = 'casino:claim:stake:claimed-licence'
    `).get()).toEqual({
      claim_type: 'context',
      support_direction: 'context_only',
    });
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM casino_claims
      WHERE claim_id = 'casino:claim:stake:ukgc-gb-exit-2025'
    `).get().count).toBe(1);
    const ukgc = database.prepare(`
      SELECT source_tier, source_role, evidence_reviewed, notes
      FROM casino_sources
      WHERE source_id = 'casino:source:stake:ukgc-exit-2025'
    `).get();
    expect(ukgc).toMatchObject({
      source_tier: 'A',
      source_role: 'independent',
      evidence_reviewed: 1,
    });
    expect(JSON.parse(ukgc.notes)).toMatchObject({
      authority_class: 'regulator',
      evidence_scope: 'jurisdictional_market_exit',
      access_state: 'accessible',
    });

    const once = database.prepare(`
      SELECT profile, sources
      FROM successful_exchanges
      WHERE type = 'cex' AND slug = 'binance'
    `).get();
    database.exec(sql);
    expect(database.prepare(`
      SELECT profile, sources
      FROM successful_exchanges
      WHERE type = 'cex' AND slug = 'binance'
    `).get()).toEqual(once);
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM casino_claims
      WHERE claim_id = 'casino:claim:stake:ukgc-gb-exit-2025'
    `).get().count).toBe(1);
  });

  it('refuses to create a migration before sequence assignment', () => {
    const run = spawnSync(
      process.execPath,
      [fileURLToPath(rendererUrl), fileURLToPath(documentUrl)],
      { encoding: 'utf8' },
    );
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('Migration rendering refused');
  });

  it('cannot consume the migration ids reserved for publication depth or NFT remediation', () => {
    database = createCorpus();
    const state = buildHighRiskEvidenceRemediation(document, database);
    expect(() => renderHighRiskEvidenceRemediationMigration(document, state, '0064'))
      .toThrow('violates reserved sequence after 0064');
  });
});

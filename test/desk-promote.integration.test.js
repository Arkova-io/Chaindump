// Route-level test for /api/desk/promote and /api/desk/reject.
//
// Why this exists: promotionPlan() only builds column/value lists for the
// columns present in the reviewer's curated record — it was never required to
// cover every column. The route wrote that partial list with `INSERT OR
// REPLACE`, which on a primary-key conflict deletes the whole existing row
// before re-inserting it. A reviewer correcting just `verdict` on an
// already-published chain would silently null out its sources/TVL/profile —
// exactly the "unsourced published claim" CLAUDE.md 1.5 exists to prevent.
import { describe, it, expect, afterEach, vi } from 'vitest';

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}
const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });

afterEach(() => vi.unstubAllGlobals());

// Minimal D1 stub covering exactly the statements /api/desk/promote and
// /api/desk/reject issue: a keyed desk_proposals store and a keyed dead_chains
// store, with INSERT OR REPLACE vs. INSERT ... ON CONFLICT DO UPDATE given
// genuinely different merge semantics (full replace vs. column-level merge).
function makeDeskDB({ proposal, chainRow } = {}) {
  const proposals = new Map();
  const chains = new Map();
  if (proposal) proposals.set(`${proposal.dataset}:${proposal.slug}`, { ...proposal });
  if (chainRow) chains.set(chainRow.chain, { ...chainRow });

  function mk(sql) {
    return {
      sql,
      binds: [],
      bind(...a) { this.binds = a; return this; },
      async first() {
        if (this.sql.includes('FROM desk_proposals')) {
          const [dataset, slug] = this.binds;
          return proposals.get(`${dataset}:${slug}`) || null;
        }
        return null;
      },
      async run() {
        let changes = 1;
        if (/INTO desk_proposals/.test(this.sql)) {
          const [
            dataset, slug, title, summary, payload, sources,
            namesIndividuals, confidence, needsHumanReview,
          ] = this.binds;
          const key = `${dataset}:${slug}`;
          const existing = proposals.get(key);
          if (this.sql.includes("WHERE desk_proposals.status = 'pending'") && existing && existing.status !== 'pending') {
            changes = 0;
          } else {
            proposals.set(key, {
              ...(existing || {}),
              dataset, slug, title, summary, payload, sources,
              names_individuals: namesIndividuals,
              confidence,
              needs_human_review: needsHumanReview,
              status: 'pending',
            });
          }
        } else if (/INTO dead_chains/.test(this.sql)) {
          const cols = this.sql.match(/\(([^)]+)\)\s+VALUES/)[1].split(',').map((s) => s.trim());
          const rec = {};
          cols.forEach((c, i) => { rec[c] = this.binds[i]; });
          if (/INSERT OR REPLACE/.test(this.sql)) {
            chains.set(rec.chain, rec); // full replace: wipes any column not in `rec`
          } else {
            chains.set(rec.chain, { ...(chains.get(rec.chain) || {}), ...rec }); // upsert merge
          }
        } else if (/UPDATE desk_proposals/.test(this.sql)) {
          const [reviewerNote, dataset, slug] = this.binds;
          const key = `${dataset}:${slug}`;
          proposals.set(key, { ...(proposals.get(key) || {}), status: this.sql.includes("status='promoted'") ? 'promoted' : 'rejected', reviewer_note: reviewerNote });
        }
        return { meta: { changes } };
      },
    };
  }
  return { prepare: (sql) => mk(sql), chains, proposals };
}

function promoteRequest(body) {
  return new Request('http://localhost/api/desk/promote', {
    method: 'POST',
    headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/desk/promote', () => {
  it('promoting a partial correction to an existing chain preserves untouched columns', async () => {
    const worker = await freshWorker();
    const db = makeDeskDB({
      proposal: { payload: JSON.stringify({}), sources: null, status: 'pending' },
      chainRow: {
        chain: 'Blast', peak_tvl: 2259400000, current_tvl: 29240000,
        sources: '[{"title":"BLAST TVL","url":"https://defillama.com/chain/Blast"}]',
        verdict: 'declining', profile: '{"tier":"zombie"}',
      },
    });
    db.proposals.set('dead_chains:blast-fix', { payload: JSON.stringify({}), sources: null, status: 'pending' });
    const env = { DB: db, DESK_REVIEW_TOKEN: 'secret' };

    const res = await worker.fetch(
      promoteRequest({ dataset: 'dead_chains', slug: 'blast-fix', record: { chain: 'Blast', verdict: 'zombie' } }),
      env, ctx(),
    );
    expect(res.status).toBe(200);

    const row = db.chains.get('Blast');
    expect(row.verdict).toBe('zombie'); // the field the reviewer actually changed
    expect(row.sources).toBeTruthy(); // NOT wiped by the promote
    expect(Number(row.peak_tvl)).toBe(2259400000); // NOT wiped by the promote
    expect(row.profile).toBeTruthy(); // NOT wiped by the promote
  });

  it('promoting a brand-new chain still inserts every provided column', async () => {
    const worker = await freshWorker();
    const db = makeDeskDB({ proposal: { payload: JSON.stringify({}), sources: null, status: 'pending' } });
    db.proposals.set('dead_chains:newchain', { payload: JSON.stringify({}), sources: null, status: 'pending' });
    const env = { DB: db, DESK_REVIEW_TOKEN: 'secret' };

    const res = await worker.fetch(
      promoteRequest({ dataset: 'dead_chains', slug: 'newchain', record: { chain: 'NewChain', verdict: 'dead', sources: [{ title: 't', url: 'https://u' }] } }),
      env, ctx(),
    );
    expect(res.status).toBe(200);
    const row = db.chains.get('NewChain');
    expect(row.verdict).toBe('dead');
    expect(row.sources).toBeTruthy();
  });

  it('does not let a proposal credential read, promote, or reject queued work', async () => {
    const worker = await freshWorker();
    const db = makeDeskDB();
    const env = { DB: db, DESK_PROPOSAL_TOKEN: 'proposal-secret', DESK_REVIEW_TOKEN: 'review-secret' };
    const auth = { authorization: 'Bearer proposal-secret', 'content-type': 'application/json' };
    const body = JSON.stringify({ dataset: 'dead_chains', slug: 'candidate' });

    const pending = await worker.fetch(new Request('http://localhost/api/desk/pending', { headers: auth }), env, ctx());
    const promote = await worker.fetch(new Request('http://localhost/api/desk/promote', { method: 'POST', headers: auth, body }), env, ctx());
    const reject = await worker.fetch(new Request('http://localhost/api/desk/reject', { method: 'POST', headers: auth, body }), env, ctx());

    expect(pending.status).toBe(401);
    expect(promote.status).toBe(401);
    expect(reject.status).toBe(401);
  });

  it('fails closed when proposal and reviewer scopes are configured with the same secret', async () => {
    const worker = await freshWorker();
    const db = makeDeskDB();
    const env = { DB: db, DESK_PROPOSAL_TOKEN: 'shared-secret', DESK_REVIEW_TOKEN: 'shared-secret' };
    const pending = await worker.fetch(new Request('http://localhost/api/desk/pending', {
      headers: { authorization: 'Bearer shared-secret' },
    }), env, ctx());

    expect(pending.status).toBe(404);
  });

  it('keeps DESK_TOKEN as a proposal-only migration fallback', async () => {
    const worker = await freshWorker();
    const db = makeDeskDB();
    const headers = { authorization: 'Bearer legacy-secret', 'content-type': 'application/json' };
    const env = { DB: db, DESK_TOKEN: 'legacy-secret' };

    const proposal = await worker.fetch(new Request('http://localhost/api/desk/propose', {
      method: 'POST',
      headers,
      body: JSON.stringify({ dataset: 'dead_chains', slug: 'candidate', confidence: 0.9 }),
    }), env, ctx());
    const pending = await worker.fetch(new Request('http://localhost/api/desk/pending', { headers }), env, ctx());

    expect(proposal.status).toBe(200);
    expect(pending.status).toBe(404);
  });

  it('server-forces every complex analysis candidate to human review', async () => {
    const worker = await freshWorker();
    const db = makeDeskDB();
    const env = { DB: db, DESK_PROPOSAL_TOKEN: 'proposal-secret' };
    const datasets = [
      'blockchain_analysis_candidate',
      'exchange_analysis_candidate',
      'casino_analysis_candidate',
      'nft_lifecycle_candidate',
    ];

    for (const dataset of datasets) {
      const slug = 'candidate-entity--lifecycle-status--2026-07-29';
      const response = await worker.fetch(new Request('http://localhost/api/desk/propose', {
        method: 'POST',
        headers: { authorization: 'Bearer proposal-secret', 'content-type': 'application/json' },
        body: JSON.stringify({
          dataset,
          slug,
          confidence: 1,
          names_individuals: false,
          // A stale/compromised client must not be able to lower the gate.
          needs_human_review: false,
          payload: {
            entity_id: 'candidate-entity',
            field_path: 'lifecycle.status',
            claim: 'The lifecycle status requires reviewer reconciliation.',
            as_of: '2026-07-29',
            source_refs: ['source-1'],
          },
          sources: [{
            id: 'source-1',
            title: 'Primary status record',
            url: 'https://example.com/status',
            source_type: 'primary',
            verified_at: '2026-07-29T18:00:00.000Z',
            verification_result: 'resolved',
          }],
        }),
      }), env, ctx());

      expect(response.status).toBe(200);
      expect((await response.json()).needs_human_review).toBe(true);
      expect(db.proposals.get(`${dataset}:${slug}`).needs_human_review).toBe(1);
    }
  });

  it('rejects analysis candidates without a claim-level citation contract', async () => {
    const worker = await freshWorker();
    const db = makeDeskDB();
    const response = await worker.fetch(new Request('http://localhost/api/desk/propose', {
      method: 'POST',
      headers: { authorization: 'Bearer proposal-secret', 'content-type': 'application/json' },
      body: JSON.stringify({
        dataset: 'exchange_analysis_candidate',
        slug: 'ascendex-status',
        confidence: 0.9,
        payload: { claim: 'A status changed.' },
        sources: [{ title: 'Article', url: 'https://example.com/article' }],
      }),
    }), { DB: db, DESK_PROPOSAL_TOKEN: 'proposal-secret' }, ctx());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid research candidate' });
    expect(db.proposals.size).toBe(0);
  });

  it('rejects noncanonical duplicate-prone candidate keys and duplicate source URLs', async () => {
    const worker = await freshWorker();
    const db = makeDeskDB();
    const response = await worker.fetch(new Request('http://localhost/api/desk/propose', {
      method: 'POST',
      headers: { authorization: 'Bearer proposal-secret', 'content-type': 'application/json' },
      body: JSON.stringify({
        dataset: 'nft_lifecycle_candidate',
        slug: 'quantum-cats-status',
        confidence: 0.9,
        payload: {
          entity_id: 'quantum-cats',
          field_path: 'lifecycle.status',
          claim: 'The current lifecycle state needs review.',
          as_of: '2026-07-29',
          source_refs: ['source-1', 'source-2'],
        },
        sources: [
          {
            id: 'source-1', title: 'Portal one', url: 'https://example.com/status',
            source_type: 'primary', verified_at: '2026-07-29T18:00:00.000Z', verification_result: 'resolved',
          },
          {
            id: 'source-2', title: 'Portal duplicate', url: 'https://example.com/status',
            source_type: 'primary', verified_at: '2026-07-29T18:01:00.000Z', verification_result: 'resolved',
          },
        ],
      }),
    }), { DB: db, DESK_PROPOSAL_TOKEN: 'proposal-secret' }, ctx());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('invalid research candidate');
    expect(body.details.join(' ')).toMatch(/slug|duplicate source URL/i);
    expect(db.proposals.size).toBe(0);
  });

  it('does not overwrite a human-reviewed proposal when the canonical claim key repeats', async () => {
    const slug = 'quantum-cats--lifecycle-status--2026-07-29';
    const db = makeDeskDB({
      proposal: {
        dataset: 'nft_lifecycle_candidate',
        slug,
        status: 'promoted',
        reviewer_note: 'Reconciled by an analyst.',
      },
    });
    const worker = await freshWorker();
    const response = await worker.fetch(new Request('http://localhost/api/desk/propose', {
      method: 'POST',
      headers: { authorization: 'Bearer proposal-secret', 'content-type': 'application/json' },
      body: JSON.stringify({
        dataset: 'nft_lifecycle_candidate',
        slug,
        confidence: 0.9,
        payload: {
          entity_id: 'quantum-cats',
          field_path: 'lifecycle.status',
          claim: 'A repeated claim must not erase review history.',
          as_of: '2026-07-29',
          source_refs: ['source-1'],
        },
        sources: [{
          id: 'source-1',
          title: 'Primary portal',
          url: 'https://example.com/status',
          source_type: 'primary',
          verified_at: '2026-07-29T18:00:00.000Z',
          verification_result: 'resolved',
        }],
      }),
    }), { DB: db, DESK_PROPOSAL_TOKEN: 'proposal-secret' }, ctx());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'proposal key already reviewed' });
    expect(db.proposals.get(`nft_lifecycle_candidate:${slug}`)).toMatchObject({
      status: 'promoted',
      reviewer_note: 'Reconciled by an analyst.',
    });
  });

  it('allows a later legacy proposal to reuse a reviewed stable entity slug', async () => {
    const db = makeDeskDB({
      proposal: {
        dataset: 'scam_intel',
        slug: 'stable-entity',
        title: 'Earlier reviewed claim',
        status: 'promoted',
        reviewer_note: 'Earlier review remains auditable.',
      },
    });
    const worker = await freshWorker();
    const response = await worker.fetch(new Request('http://localhost/api/desk/propose', {
      method: 'POST',
      headers: { authorization: 'Bearer proposal-secret', 'content-type': 'application/json' },
      body: JSON.stringify({
        dataset: 'scam_intel',
        slug: 'stable-entity',
        title: 'Later evidence for the same entity',
        summary: 'A stable entity slug must remain reusable for a later review cycle.',
        confidence: 0.9,
        payload: { status: 'updated-candidate' },
        sources: [{ title: 'Later source', url: 'https://example.com/later' }],
      }),
    }), { DB: db, DESK_PROPOSAL_TOKEN: 'proposal-secret' }, ctx());

    expect(response.status).toBe(200);
    expect(db.proposals.get('scam_intel:stable-entity')).toMatchObject({
      status: 'pending',
      title: 'Later evidence for the same entity',
      reviewer_note: 'Earlier review remains auditable.',
    });
  });
});

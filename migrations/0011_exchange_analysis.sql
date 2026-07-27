-- Dead & Stuck-Mid case studies for DEXs and CEXs, mirroring dead_chains/mid_chains
-- (see migrations/0001_init.sql). Two tables, not four: dead vs mid are genuinely
-- different shapes (decline-from-peak vs stuck-in-place snapshot — the same reason
-- dead_chains and mid_chains are split today), but DEX vs CEX are NOT a different
-- shape (both: name, launch, one headline metric, verdict, profile) so they share
-- a table via `kind`, rather than duplicating a near-identical pair of tables and
-- a near-identical pair of route handlers per kind.
CREATE TABLE IF NOT EXISTS dead_exchanges (
  slug          TEXT NOT NULL,        -- normalized id, e.g. 'ftx', 'sushiswap'
  kind          TEXT NOT NULL,        -- 'dex' | 'cex'
  name          TEXT NOT NULL,
  launched      TEXT,                 -- 'YYYY-MM'
  metric_label  TEXT NOT NULL,        -- e.g. '24h volume' (dex) | 'daily trading volume' (cex)
  peak_metric     REAL,
  current_metric  REAL,
  drawdown_pct    REAL,
  peak_date       TEXT,
  collapse_date   TEXT,
  why           TEXT,
  outlook       TEXT,
  verdict       TEXT,
  sources       TEXT,                 -- JSON [{title,url}]
  profile       TEXT,                 -- JSON — same dossier shape as dead_chains.profile
  updated_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (kind, slug)
);
CREATE INDEX IF NOT EXISTS idx_dead_exchanges_kind ON dead_exchanges(kind);

CREATE TABLE IF NOT EXISTS mid_exchanges (
  slug          TEXT NOT NULL,
  kind          TEXT NOT NULL,        -- 'dex' | 'cex'
  name          TEXT NOT NULL,
  launched      TEXT,
  metric_label  TEXT NOT NULL,
  metric        REAL,                 -- current value only — no peak/drawdown framing, matches mid_chains.tvl
  verdict       TEXT,
  why_stuck     TEXT,
  outlook       TEXT,
  profile       TEXT,
  sources       TEXT,
  updated_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (kind, slug)
);
CREATE INDEX IF NOT EXISTS idx_mid_exchanges_kind ON mid_exchanges(kind);

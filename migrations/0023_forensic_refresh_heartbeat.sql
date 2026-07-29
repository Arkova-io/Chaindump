-- Six-hour review heartbeat for citation-backed forensic dossiers.
-- This records review debt; it never changes a lifecycle conclusion or promotes
-- an analyst-generated claim without human review.
CREATE TABLE IF NOT EXISTS forensic_refresh_runs (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheduled_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  scanned_nft INTEGER NOT NULL DEFAULT 0,
  due_nft INTEGER NOT NULL DEFAULT 0,
  scanned_exchange INTEGER NOT NULL DEFAULT 0,
  due_exchange INTEGER NOT NULL DEFAULT 0,
  scanned_casino INTEGER NOT NULL DEFAULT 0,
  due_casino INTEGER NOT NULL DEFAULT 0,
  scanned_chain INTEGER NOT NULL DEFAULT 0,
  due_chain INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_forensic_refresh_runs_completed
  ON forensic_refresh_runs(completed_at DESC);

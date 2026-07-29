-- Durable, public-safe status for the opt-in proposal research agent.
-- This records execution only. It grants no review or publication authority.
CREATE TABLE IF NOT EXISTS research_desk_runs (
  run_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  proposals_queued INTEGER NOT NULL DEFAULT 0 CHECK (proposals_queued >= 0)
);

CREATE INDEX IF NOT EXISTS idx_research_desk_runs_started
  ON research_desk_runs(started_at DESC);

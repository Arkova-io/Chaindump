export const RESEARCH_DESK_CADENCE_MS = 6 * 60 * 60 * 1000;
export const FORENSIC_SCAN_GRACE_MS = 10 * 60 * 1000;
export const PROPOSAL_RUN_GRACE_MS = 45 * 60 * 1000;
export const PROPOSAL_RUNNING_LIMIT_MS = 45 * 60 * 1000;
export const PROPOSAL_SCHEDULE_MINUTE_UTC = 17;

function parseUtcTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return Number.NaN;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  return Date.parse(normalized);
}

function isoOrNull(timestamp) {
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function nextProposalSchedule(timestamp) {
  if (!Number.isFinite(timestamp)) return Number.NaN;
  const completed = new Date(timestamp);
  const scheduledHour = Math.floor(completed.getUTCHours() / 6) * 6;
  let candidate = Date.UTC(
    completed.getUTCFullYear(),
    completed.getUTCMonth(),
    completed.getUTCDate(),
    scheduledHour,
    PROPOSAL_SCHEDULE_MINUTE_UTC,
  );
  if (candidate <= timestamp) candidate += RESEARCH_DESK_CADENCE_MS;
  return candidate;
}

function timedState(timestamp, nowMs, graceMs, nextDue = timestamp + RESEARCH_DESK_CADENCE_MS) {
  if (!Number.isFinite(timestamp) || timestamp > nowMs + FORENSIC_SCAN_GRACE_MS) {
    return {
      state: 'unknown',
      last_completed_at: null,
      next_due_at: null,
      age_seconds: null,
    };
  }
  return {
    state: nowMs > nextDue + graceMs ? 'stale' : 'current',
    last_completed_at: isoOrNull(timestamp),
    next_due_at: isoOrNull(nextDue),
    age_seconds: Math.floor(Math.max(0, nowMs - timestamp) / 1000),
  };
}

export function forensicRefreshFreshness(refresh, nowMs = Date.now()) {
  if (!refresh) return timedState(Number.NaN, nowMs, FORENSIC_SCAN_GRACE_MS);
  const result = timedState(
    parseUtcTimestamp(refresh.completed_at || refresh.scheduled_at),
    nowMs,
    FORENSIC_SCAN_GRACE_MS,
  );
  return refresh.status === 'failed' ? { ...result, state: 'failed' } : result;
}

export function proposalAgentFreshness(run, nowMs = Date.now()) {
  if (!run) return timedState(Number.NaN, nowMs, PROPOSAL_RUN_GRACE_MS);
  if (run.status === 'running') {
    const startedAt = parseUtcTimestamp(run.started_at);
    if (!Number.isFinite(startedAt) || startedAt > nowMs + FORENSIC_SCAN_GRACE_MS) {
      return {
        state: 'unknown',
        last_completed_at: null,
        next_due_at: null,
        age_seconds: null,
      };
    }
    return {
      state: nowMs - startedAt > PROPOSAL_RUNNING_LIMIT_MS ? 'stale' : 'running',
      last_completed_at: null,
      next_due_at: null,
      age_seconds: Math.floor(Math.max(0, nowMs - startedAt) / 1000),
      started_at: isoOrNull(startedAt),
    };
  }
  const completedAt = parseUtcTimestamp(run.completed_at);
  const result = timedState(
    completedAt,
    nowMs,
    PROPOSAL_RUN_GRACE_MS,
    nextProposalSchedule(completedAt),
  );
  return run.status === 'failed' ? { ...result, state: 'failed' } : result;
}

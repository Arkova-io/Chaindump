import { randomUUID } from "node:crypto";

type RunStatus = "running" | "completed" | "failed";

type RunEnvironment = {
  GITHUB_RUN_ID?: string;
  GITHUB_RUN_ATTEMPT?: string;
};

type RunStatusOptions = {
  baseUrl: string;
  token: string;
  runId: string;
  status: RunStatus;
  proposalsQueued?: number;
  fetchImpl?: typeof fetch;
};

export function buildResearchRunId(env: RunEnvironment = process.env): string {
  const workflowRun = String(env.GITHUB_RUN_ID || "").trim();
  const attempt = String(env.GITHUB_RUN_ATTEMPT || "1").trim();
  if (workflowRun && /^\d+$/.test(workflowRun) && /^\d+$/.test(attempt)) {
    return `github-${workflowRun}-${attempt}`;
  }
  return `local-${randomUUID()}`;
}

export async function postResearchRunStatus({
  baseUrl,
  token,
  runId,
  status,
  proposalsQueued = 0,
  fetchImpl = fetch,
}: RunStatusOptions): Promise<boolean> {
  if (!token) return false;
  const response = await fetchImpl(
    `${baseUrl.replace(/\/$/, "")}/api/desk/run-status`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        run_id: runId,
        status,
        proposals_queued: Math.max(0, Math.trunc(proposalsQueued)),
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`research run status returned HTTP ${response.status}`);
  }
  return true;
}

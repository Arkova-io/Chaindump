import { describe, expect, it, vi } from "vitest";
import { buildResearchRunId, postResearchRunStatus } from "../src/run-status.js";

describe("proposal research run status", () => {
  it("builds a stable GitHub run-attempt id", () => {
    expect(buildResearchRunId({
      GITHUB_RUN_ID: "30491234567",
      GITHUB_RUN_ATTEMPT: "2",
    })).toBe("github-30491234567-2");
  });

  it("posts only public-safe execution fields with the proposal credential", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    await expect(postResearchRunStatus({
      baseUrl: "https://chaindump.xyz/",
      token: "secret",
      runId: "github-30491234567-2",
      status: "completed",
      proposalsQueued: 4,
      fetchImpl,
    })).resolves.toBe(true);

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://chaindump.xyz/api/desk/run-status");
    expect(options.headers.authorization).toBe("Bearer secret");
    expect(JSON.parse(options.body)).toEqual({
      run_id: "github-30491234567-2",
      status: "completed",
      proposals_queued: 4,
    });
  });

  it("skips offline status reporting and fails loudly on configured remote errors", async () => {
    await expect(postResearchRunStatus({
      baseUrl: "https://chaindump.xyz",
      token: "",
      runId: "local-run",
      status: "running",
    })).resolves.toBe(false);

    await expect(postResearchRunStatus({
      baseUrl: "https://chaindump.xyz",
      token: "secret",
      runId: "github-1-1",
      status: "running",
      fetchImpl: vi.fn(async () => new Response("no", { status: 503 })),
    })).rejects.toThrow("HTTP 503");
  });
});

import { describe, expect, it, vi } from "vitest";
import { runResearchDeskLifecycle } from "../src/lifecycle.js";

const baseOptions = (overrides = {}) => ({
  baseUrl: "https://chaindump.xyz",
  token: "proposal-secret",
  runId: "github-30491234567-1",
  assertReady: vi.fn(),
  runDesk: vi.fn(async () => 3),
  postStatus: vi.fn(async () => true),
  onTerminalStatusError: vi.fn(),
  ...overrides,
});

describe("research desk lifecycle", () => {
  it("records running then completed with the persisted proposal count", async () => {
    const options = baseOptions();

    await expect(runResearchDeskLifecycle(options)).resolves.toBe(3);
    expect(options.postStatus.mock.calls.map(([payload]) => payload.status))
      .toEqual(["running", "completed"]);
    expect(options.postStatus.mock.calls[1][0]).toMatchObject({
      status: "completed",
      proposalsQueued: 3,
    });
  });

  it("records failed when prerequisite validation stops the desk before research", async () => {
    const options = baseOptions({
      assertReady: vi.fn(() => {
        throw new Error("missing prerequisite");
      }),
    });

    await expect(runResearchDeskLifecycle(options)).rejects.toThrow("missing prerequisite");
    expect(options.runDesk).not.toHaveBeenCalled();
    expect(options.postStatus.mock.calls.map(([payload]) => payload.status))
      .toEqual(["running", "failed"]);
  });

  it("records failed when the research pass throws", async () => {
    const options = baseOptions({
      runDesk: vi.fn(async () => {
        throw new Error("desk failed");
      }),
    });

    await expect(runResearchDeskLifecycle(options)).rejects.toThrow("desk failed");
    expect(options.postStatus.mock.calls.map(([payload]) => payload.status))
      .toEqual(["running", "failed"]);
  });

  it("preserves the original failure when recording the terminal failure also fails", async () => {
    const terminalError = new Error("status endpoint failed");
    const postStatus = vi.fn(async ({ status }) => {
      if (status === "failed") throw terminalError;
      return true;
    });
    const options = baseOptions({
      postStatus,
      runDesk: vi.fn(async () => {
        throw new Error("desk failed");
      }),
    });

    await expect(runResearchDeskLifecycle(options)).rejects.toThrow("desk failed");
    expect(options.onTerminalStatusError).toHaveBeenCalledWith(terminalError);
  });
});

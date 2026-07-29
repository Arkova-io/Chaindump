import type { postResearchRunStatus } from "./run-status.js";

type PostStatus = typeof postResearchRunStatus;

type LifecycleOptions = {
  baseUrl: string;
  token: string;
  runId: string;
  assertReady: () => void;
  runDesk: () => Promise<number>;
  postStatus: PostStatus;
  onTerminalStatusError?: (error: unknown) => void;
};

export async function runResearchDeskLifecycle({
  baseUrl,
  token,
  runId,
  assertReady,
  runDesk,
  postStatus,
  onTerminalStatusError = () => {},
}: LifecycleOptions): Promise<number> {
  let runStatusStarted = false;
  if (token) {
    await postStatus({
      baseUrl,
      token,
      runId,
      status: "running",
    });
    runStatusStarted = true;
  }

  try {
    assertReady();
    const proposalsQueued = await runDesk();
    if (runStatusStarted) {
      await postStatus({
        baseUrl,
        token,
        runId,
        status: "completed",
        proposalsQueued,
      });
    }
    return proposalsQueued;
  } catch (error) {
    if (runStatusStarted) {
      try {
        await postStatus({
          baseUrl,
          token,
          runId,
          status: "failed",
        });
      } catch (statusError) {
        onTerminalStatusError(statusError);
      }
    }
    throw error;
  }
}

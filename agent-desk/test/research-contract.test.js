import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ANALYSIS_ENDPOINT_PATHS,
  DEFAULT_RESEARCH_TASK,
  analysisEndpointUrls,
  buildResearchSystemPrompt,
} from "../src/research.js";

describe("cross-vertical research contract", () => {
  it("targets every public freshness and analysis surface", () => {
    expect(ANALYSIS_ENDPOINT_PATHS).toEqual({
      reviewDebt: "/api/forensics-refresh-status",
      blockchains: "/api/chains",
      dex: "/api/exchange-analysis?kind=dex",
      cex: "/api/exchange-analysis?kind=cex",
      casinos: "/api/casinos",
      casinoDetail: "/api/casino/{case_id}",
      nftOrdinals: "/api/nft",
    });
    expect(analysisEndpointUrls("https://chaindump.xyz/").dex).toBe(
      "https://chaindump.xyz/api/exchange-analysis?kind=dex",
    );
  });

  it("requires WebFetch verification, dedupe, causal skepticism, and candidate-only output", () => {
    const prompt = buildResearchSystemPrompt("https://chaindump.xyz");
    for (const path of Object.values(ANALYSIS_ENDPOINT_PATHS)) expect(prompt).toContain(path);
    expect(prompt).toContain("WebFetch");
    expect(prompt).toContain("Deduplicate");
    expect(prompt).toContain("FIELD-LEVEL EVIDENCE CANDIDATE");
    expect(prompt).toContain("never publish");
    expect(prompt).toContain("cannot be directly promoted");
    expect(prompt).toContain("alternative explanations");
    expect(DEFAULT_RESEARCH_TASK).toContain("at most one");
    expect(DEFAULT_RESEARCH_TASK).toContain("It is valid to queue nothing");
  });
});

describe("scheduled workflow safety contract", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/research-desk.yml", import.meta.url),
    "utf8",
  );

  it("is six-hour, opt-in, bounded, and proposal-only", () => {
    expect(workflow).toContain('cron: "17 */6 * * *"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("vars.RESEARCH_DESK_ENABLED == 'true'");
    expect(workflow).toContain("timeout-minutes: 30");
    expect(workflow).toContain("RESEARCH_DESK_PROPOSAL_TOKEN");
    expect(workflow).not.toContain("DESK_REVIEW_TOKEN");
    expect(workflow).not.toContain("/api/desk/promote");
    expect(workflow).not.toContain("contents: write");
  });
});

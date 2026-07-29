// Chaindump research desk — an autonomous, scheduled agent that keeps Chaindump's
// forensic / graveyard / policy / trend-analysis data fresh and SOURCED, running
// the same verified loop we do by hand: discover -> research -> adversarially
// fact-check -> cite -> QUEUE FOR HUMAN REVIEW.
//
// Hard rule (CLAUDE.md §1.5): it NEVER publishes directly. Every finding is
// written to a review queue; anything naming a private individual or asserting
// fraud/crime is force-flagged for human review before it can reach the site.
//
// Tools: the live chain-intel MCP server (our own dogfooded tools) + web research
// + a single custom `queue_proposal` tool. Model + key from the environment
// (ANTHROPIC_API_KEY; in prod, from GCP Secret Manager `Anthropic`).

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { PROPOSAL_DATASETS, sanitizeSlug, buildRecord } from "./proposal.js";
import { buildResearchSystemPrompt, DEFAULT_RESEARCH_TASK } from "./research.js";
import { buildResearchRunId, postResearchRunStatus } from "./run-status.js";

const MCP_URL = process.env.CHAINDUMP_MCP_URL || "https://chaindump-mcp-270018525501.us-central1.run.app/mcp";
const QUEUE_DIR = process.env.DESK_QUEUE_DIR || "./proposals";
const MODEL = process.env.DESK_MODEL || "claude-sonnet-5";
const MAX_TURNS = Number(process.env.DESK_MAX_TURNS) || 20;
const CHAINDUMP_BASE = (process.env.CHAINDUMP_BASE_URL || "https://chaindump.xyz").replace(/\/$/, "");
const DESK_PROPOSAL_TOKEN = process.env.DESK_PROPOSAL_TOKEN || process.env.DESK_TOKEN || "";
let proposalPersistenceFailures = 0;

// Persist a proposal to the durable, human-reviewed queue via the Worker's
// authenticated write path (/api/desk/propose). Falls back to a local file only
// when DESK_PROPOSAL_TOKEN isn't set (offline/dev). A configured remote queue
// must fail loudly: a GitHub runner's local filesystem is ephemeral and cannot
// safely masquerade as durable persistence.
async function tryPostProposal(record: unknown): Promise<boolean> {
  if (!DESK_PROPOSAL_TOKEN) return false;
  try {
    const r = await fetch(`${CHAINDUMP_BASE}/api/desk/propose`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${DESK_PROPOSAL_TOKEN}` },
      body: JSON.stringify(record),
    });
    if (r.ok) return true;
    throw new Error(`proposal queue returned HTTP ${r.status}`);
  } catch (e) {
    proposalPersistenceFailures += 1;
    throw new Error(`proposal queue write failed: ${e instanceof Error ? e.message : e}`);
  }
}

async function persistProposal(dataset: string, slug: string, record: unknown): Promise<string> {
  if (await tryPostProposal(record)) return "the review queue (/api/desk/propose)";
  await mkdir(QUEUE_DIR, { recursive: true });
  const safeSlug = sanitizeSlug(slug);
  await writeFile(join(QUEUE_DIR, `${dataset}.${safeSlug}.json`), JSON.stringify(record, null, 2), "utf8");
  return `a local file (${QUEUE_DIR})`;
}

// ---- the human-gated persistence tool --------------------------------------
// The desk's ONLY write path. It does not touch D1; it queues a proposal for a
// human/promotion step. Sensitive proposals are force-flagged.

const queueProposal = tool(
  "queue_proposal",
  "Queue ONE researched, fully-sourced finding for HUMAN REVIEW. This is the only persistence path and it never publishes. Cross-vertical analysis datasets accept field-level evidence candidates only, never full dossier replacements. Call once per verified, deduplicated claim as the final step.",
  {
    dataset: z
      .enum(PROPOSAL_DATASETS)
      .describe("Target queue. Analysis candidate datasets are evidence-only and cannot be directly promoted."),
    slug: z.string().min(2).describe("Stable kebab-case identifier for the entity/finding."),
    title: z.string().describe("Short human-readable title."),
    summary: z.string().describe("One-paragraph summary of the finding and why it matters now."),
    payload: z
      .record(z.string(), z.unknown())
      .describe(
        "For analysis candidates: canonical entity id, exact field/claim, existing value if known, evidence, explicit as_of, source date/type/verification, causal reasoning, counterevidence/unknowns, and reviewer action. Never submit a full dossier replacement.",
      ),
    sources: z
      .array(z.object({ title: z.string(), url: z.string().url() }))
      .min(1)
      .describe("Resolving, authoritative sources — each must have been verified to load."),
    names_individuals: z
      .boolean()
      .describe("TRUE if this names a private individual or asserts fraud/crime. Forces human review (non-negotiable)."),
    confidence: z.number().min(0).max(1).describe("0-1 confidence in the finding."),
  },
  async (args) => {
    const record = buildRecord(args, new Date().toISOString());
    const needsHumanReview = record.needs_human_review;
    const persisted = await persistProposal(args.dataset, args.slug, record);
    return {
      content: [
        {
          type: "text" as const,
          text: `Queued proposal "${args.slug}" -> ${args.dataset} (needs_human_review=${needsHumanReview}, confidence=${args.confidence}) via ${persisted}. It will NOT publish until a human promotes it.`,
        },
      ],
    };
  },
);

const deskTools = createSdkMcpServer({ name: "desk", version: "0.1.0", tools: [queueProposal] });

// ---- the desk's operating rules --------------------------------------------

const SYSTEM_PROMPT = buildResearchSystemPrompt(CHAINDUMP_BASE);

// ---- one desk run -----------------------------------------------------------

async function runDesk(task: string): Promise<number> {
  let proposals = 0;
  const run = query({
    prompt: task,
    options: {
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: MAX_TURNS,
      // Headless/unattended (Cloud Run Job / scheduled Action): no terminal to
      // answer prompts. bypassPermissions requires this companion safety flag,
      // or tool calls stall. Scoped by the allowedTools allowlist below.
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      mcpServers: {
        "chain-intel": { type: "http", url: MCP_URL },
        desk: deskTools,
      },
      allowedTools: [
        "WebSearch",
        "WebFetch",
        "mcp__chain-intel__screen_address",
        "mcp__chain-intel__chain_intel",
        "mcp__chain-intel__chain_forensics",
        "mcp__chain-intel__power_ranking",
        "mcp__chain-intel__rwa_depin",
        "mcp__chain-intel__scam_cases",
        "mcp__desk__queue_proposal",
      ],
    },
  });

  for await (const message of run) {
    if (message.type === "result") {
      const cost = "total_cost_usd" in message ? message.total_cost_usd : undefined;
      console.error(`[desk] run finished: ${proposals} proposal(s) queued to ${QUEUE_DIR}` + (cost != null ? ` — $${cost.toFixed(4)}` : ""));
      continue;
    }
    if (message.type !== "assistant") continue;
    for (const block of message.message.content) {
      if (block.type === "tool_use" && block.name === "mcp__desk__queue_proposal") proposals += 1;
    }
  }
  if (proposalPersistenceFailures > 0) {
    throw new Error(`${proposalPersistenceFailures} proposal queue write(s) failed; no ephemeral fallback was accepted`);
  }
  return proposals;
}

// ---- entry ------------------------------------------------------------------
// A single scheduled pass. In prod this is a Cloud Run Job / scheduled GitHub
// Action; the task can be parameterized. The default is a bounded review-debt
// pass across all four analysis surfaces, not an instruction to rewrite them.

const TASK = process.env.DESK_TASK || DEFAULT_RESEARCH_TASK;
const RESEARCH_RUN_ID = buildResearchRunId();
let runStatusStarted = false;

try {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set (in prod, load it from GCP Secret Manager `Anthropic`).");
  }
  if (DESK_PROPOSAL_TOKEN) {
    await postResearchRunStatus({
      baseUrl: CHAINDUMP_BASE,
      token: DESK_PROPOSAL_TOKEN,
      runId: RESEARCH_RUN_ID,
      status: "running",
    });
    runStatusStarted = true;
  }
  const proposalsQueued = await runDesk(TASK);
  if (runStatusStarted) {
    await postResearchRunStatus({
      baseUrl: CHAINDUMP_BASE,
      token: DESK_PROPOSAL_TOKEN,
      runId: RESEARCH_RUN_ID,
      status: "completed",
      proposalsQueued,
    });
  }
} catch (e) {
  if (runStatusStarted) {
    try {
      await postResearchRunStatus({
        baseUrl: CHAINDUMP_BASE,
        token: DESK_PROPOSAL_TOKEN,
        runId: RESEARCH_RUN_ID,
        status: "failed",
      });
    } catch (statusError) {
      console.error("[desk] failed to record terminal run status:", statusError instanceof Error ? statusError.message : statusError);
    }
  }
  console.error("[desk] fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
}

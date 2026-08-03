import { GoogleGenAI } from "@google/genai";
import { isIP } from "node:net";
import { queueProposalInputSchema, type QueueProposalInput } from "./proposal.js";

/** The default is the low-cost Flash-Lite model; callers can opt into another model explicitly. */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
export const DEFAULT_GEMINI_MAX_TURNS = 6;
export const DEFAULT_GEMINI_MAX_OUTPUT_TOKENS = 4096;

export type GeminiDeskOptions = {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  task: string;
  maxTurns?: number;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
  queueProposal: (input: QueueProposalInput) => Promise<string>;
};

/** Provider selection is explicit so a missing Gemini secret never silently falls back to Anthropic. */
export function resolveDeskProvider(value = process.env.DESK_PROVIDER): "gemini" | "claude" {
  const provider = (value || "gemini").trim().toLowerCase();
  if (provider === "gemini" || provider === "claude") return provider;
  throw new Error(`Unsupported DESK_PROVIDER "${provider}"; use gemini or claude`);
}

/** Reject local/private targets before a model-controlled fetch (SSRF guard). */
export function isSafePublicUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  if (host === "metadata.google.internal" || host === "instance-data.ec2.internal") return false;
  const ip = isIP(host);
  if (ip === 4) {
    const octets = host.split(".").map(Number);
    if (octets[0] === 10 || octets[0] === 127 || octets[0] === 0 || octets[0] >= 224) return false;
    if (octets[0] === 169 && octets[1] === 254) return false;
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
    if (octets[0] === 192 && octets[1] === 168) return false;
  }
  // IPv6 loopback, link-local, unique-local, and unspecified ranges.
  if (ip === 6 && (host === "::1" || host === "::" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd"))) return false;
  return true;
}

const FUNCTION_DECLARATIONS = [{
  functionDeclarations: [
    {
      name: "fetch_url",
      description: "Fetch one public HTTPS URL for source verification or a Chaindump public API. Never send credentials or mutate a resource.",
      parametersJsonSchema: {
        type: "object",
        properties: { url: { type: "string", description: "An HTTPS URL" } },
        required: ["url"],
      },
    },
    {
      name: "queue_proposal",
      description: "Queue one fully sourced field-level evidence candidate for human review. This never publishes.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          dataset: { type: "string", enum: ["blockchain_analysis_candidate", "exchange_analysis_candidate", "casino_analysis_candidate", "nft_lifecycle_candidate", "entity_analysis_candidate"] },
          slug: { type: "string" }, title: { type: "string" }, summary: { type: "string" },
          payload: { type: "object" },
          sources: { type: "array", items: { type: "object", properties: {
            id: { type: "string" }, title: { type: "string" }, url: { type: "string" }, source_type: { type: "string" }, verified_at: { type: "string" }, verification_result: { type: "string", enum: ["resolved"] },
          }, required: ["id", "title", "url", "source_type", "verified_at", "verification_result"] } },
          names_individuals: { type: "boolean" }, confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["dataset", "slug", "title", "summary", "payload", "sources", "names_individuals", "confidence"],
      },
    },
  ],
}];

const MAX_FETCH_BYTES = 120_000;

async function fetchPublicUrl(rawUrl: unknown, fetchImpl: typeof fetch): Promise<Record<string, unknown>> {
  if (typeof rawUrl !== "string" || !isSafePublicUrl(rawUrl)) return { error: "Only public HTTPS URLs are allowed" };
  try {
    const response = await fetchImpl(rawUrl, { redirect: "error", signal: AbortSignal.timeout(15_000) });
    const body = (await response.text()).slice(0, MAX_FETCH_BYTES);
    return { url: rawUrl, status: response.status, content_type: response.headers.get("content-type"), body };
  } catch (error) {
    return { url: rawUrl, error: error instanceof Error ? error.message : "fetch failed" };
  }
}

/**
 * Bounded Gemini adapter. It intentionally exposes only read-only public fetch
 * and the human-gated queue tool; it does not expose the Claude MCP server or
 * any publish/promote operation. This keeps the cheaper provider safe while
 * the richer MCP parity is evaluated separately.
 */
export async function runGeminiDesk(options: GeminiDeskOptions): Promise<number> {
  if (!options.apiKey.trim()) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  const model = options.model || DEFAULT_GEMINI_MODEL;
  const maxTurns = Math.max(1, Math.min(options.maxTurns ?? DEFAULT_GEMINI_MAX_TURNS, 12));
  const maxOutputTokens = Math.max(256, Math.min(options.maxOutputTokens ?? DEFAULT_GEMINI_MAX_OUTPUT_TOKENS, 8192));
  const fetchImpl = options.fetchImpl || fetch;
  const contents: any[] = [{ role: "user", parts: [{ text: options.task }] }];
  let proposals = 0;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: options.systemPrompt + "\n\nGemini provider safety boundary: use only fetch_url for read-only public HTTPS research and queue_proposal for field-level human review. Do not claim MCP tools are available; do not publish.",
        tools: FUNCTION_DECLARATIONS as any,
        temperature: 0.1,
        maxOutputTokens,
      },
    });
    const candidateContent = response.candidates?.[0]?.content;
    if (candidateContent) contents.push(candidateContent);
    const calls = response.functionCalls || [];
    if (!calls.length) break;
    const functionResponses: any[] = [];
    for (const call of calls) {
      let output: Record<string, unknown>;
      if (call.name === "fetch_url") {
        output = await fetchPublicUrl(call.args?.url, fetchImpl);
      } else if (call.name === "queue_proposal") {
        const parsed = queueProposalInputSchema.safeParse(call.args);
        if (!parsed.success) {
          output = { error: "Invalid proposal shape", details: parsed.error.issues.map((issue) => issue.path.join(".")) };
        } else {
          try {
            const destination = await options.queueProposal(parsed.data);
            proposals += 1;
            output = { queued: true, destination, needs_human_review: true };
          } catch (error) {
            output = { error: error instanceof Error ? error.message : "queue failed" };
          }
        }
      } else {
        output = { error: "Tool not available" };
      }
      functionResponses.push({ functionResponse: { name: call.name, response: output, ...(call.id ? { id: call.id } : {}) } });
    }
    contents.push({ role: "user", parts: functionResponses });
  }
  return proposals;
}

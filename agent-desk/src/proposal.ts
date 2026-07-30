// Pure, testable helpers for the desk's human-review gate and proposal shaping.
// The base gate MUST match the Worker's server-side rule in /api/desk/propose
// (defense in depth): anything that names a private individual, or is below 0.75
// confidence — including invalid/NaN confidence — is forced to human review.
//
// Cross-vertical research candidates are stricter: they are evidence packets,
// not replacement rows, and are ALWAYS review-required. They are deliberately
// absent from the Worker's direct-promotion allowlist.

import { z } from "zod";

/** Existing simple row datasets accepted by the Worker's promotion allowlist. */
export const DIRECTLY_PROMOTABLE_DATASETS = [
  "scam_intel",
  "dead_chains",
  "mid_chains",
  "risk_signals",
] as const;

/** Existing queue types which already require a separate handling path. */
export const LEGACY_QUEUE_ONLY_DATASETS = ["policy", "desk_log"] as const;

/**
 * Evidence-only proposal types for the forensic product surfaces.
 *
 * These MUST NOT be added to the Worker's direct-promotion allowlist. A reviewer
 * has to reconcile each field-level candidate with the canonical dossier.
 */
export const RESEARCH_CANDIDATE_DATASETS = [
  "blockchain_analysis_candidate",
  "exchange_analysis_candidate",
  "casino_analysis_candidate",
  "nft_lifecycle_candidate",
] as const;

export const PROPOSAL_DATASETS = [
  ...DIRECTLY_PROMOTABLE_DATASETS,
  ...LEGACY_QUEUE_ONLY_DATASETS,
  ...RESEARCH_CANDIDATE_DATASETS,
] as const;

export type ProposalDataset = (typeof PROPOSAL_DATASETS)[number];

/** Runtime input contract shared by the Claude and Gemini proposal adapters. */
export const queueProposalInputSchema = z.object({
  dataset: z.enum(PROPOSAL_DATASETS),
  slug: z.string().min(2),
  title: z.string(),
  summary: z.string(),
  payload: z.record(z.string(), z.unknown()),
  sources: z.array(z.object({
    id: z.string(),
    title: z.string(),
    url: z.string().url(),
    source_type: z.string(),
    verified_at: z.string(),
    verification_result: z.literal("resolved"),
  })).min(1),
  names_individuals: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type QueueProposalInput = z.infer<typeof queueProposalInputSchema>;

export interface ProposalGateInput {
  dataset?: string;
  names_individuals?: boolean;
  confidence?: number;
}

export function isProposalDataset(value: string): value is ProposalDataset {
  return (PROPOSAL_DATASETS as readonly string[]).includes(value);
}

export function isResearchCandidateDataset(value: string | undefined): boolean {
  return Boolean(value && (RESEARCH_CANDIDATE_DATASETS as readonly string[]).includes(value));
}

export function isDirectlyPromotableDataset(value: string): boolean {
  return (DIRECTLY_PROMOTABLE_DATASETS as readonly string[]).includes(value);
}

/** True if the proposal must go to human review before it can be published. */
export function gateProposal(args: ProposalGateInput): boolean {
  if (isResearchCandidateDataset(args.dataset)) return true;
  const highConfidence = Number.isFinite(args.confidence as number) && (args.confidence as number) >= 0.75;
  return Boolean(args.names_individuals) || !highConfidence;
}

/** Stable, safe kebab-case slug: lowercase, illegal runs -> "-", trimmed, <=80. */
export function sanitizeSlug(slug: string): string {
  return String(slug)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Shape the queued record: stamp the review flag + timestamp, preserve fields. */
export function buildRecord<T extends ProposalGateInput>(
  args: T,
  nowIso: string,
): T & { needs_human_review: boolean; queued_at: string } {
  return { ...args, needs_human_review: gateProposal(args), queued_at: nowIso };
}

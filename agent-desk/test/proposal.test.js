import { describe, it, expect } from "vitest";
import {
  DIRECTLY_PROMOTABLE_DATASETS,
  PROPOSAL_DATASETS,
  RESEARCH_CANDIDATE_DATASETS,
  gateProposal,
  sanitizeSlug,
  buildRecord,
  isDirectlyPromotableDataset,
  isProposalDataset,
  isResearchCandidateDataset,
} from "../src/proposal.js";

// The desk NEVER publishes directly — it queues proposals for human review.
// gateProposal is the safety rule (must match the Worker's server-side gate):
// anything naming an individual, or below 0.75 confidence (incl. invalid), is
// forced to human review.
describe("gateProposal", () => {
  it("forces review when it names a private individual", () => {
    expect(gateProposal({ names_individuals: true, confidence: 0.99 })).toBe(true);
  });
  it("forces review on low confidence even without a name", () => {
    expect(gateProposal({ names_individuals: false, confidence: 0.5 })).toBe(true);
    expect(gateProposal({ names_individuals: false, confidence: 0.7499 })).toBe(true);
  });
  it("does NOT force review for high-confidence, no-name findings", () => {
    expect(gateProposal({ names_individuals: false, confidence: 0.75 })).toBe(false);
    expect(gateProposal({ names_individuals: false, confidence: 0.9 })).toBe(false);
  });
  it("treats invalid/NaN/missing confidence as low (safe default = review)", () => {
    expect(gateProposal({ names_individuals: false, confidence: NaN })).toBe(true);
    expect(gateProposal({ names_individuals: false, confidence: undefined })).toBe(true);
    expect(gateProposal({ names_individuals: false })).toBe(true);
  });
  it("always forces review for every cross-vertical analysis candidate", () => {
    for (const dataset of RESEARCH_CANDIDATE_DATASETS) {
      expect(gateProposal({ dataset, names_individuals: false, confidence: 1 })).toBe(true);
    }
  });
});

describe("proposal dataset safety contract", () => {
  it("allows every forensic analysis family in the proposal queue", () => {
    expect(RESEARCH_CANDIDATE_DATASETS).toEqual([
      "blockchain_analysis_candidate",
      "exchange_analysis_candidate",
      "casino_analysis_candidate",
      "nft_lifecycle_candidate",
      "entity_analysis_candidate",
    ]);
    for (const dataset of RESEARCH_CANDIDATE_DATASETS) {
      expect(PROPOSAL_DATASETS).toContain(dataset);
      expect(isProposalDataset(dataset)).toBe(true);
      expect(isResearchCandidateDataset(dataset)).toBe(true);
    }
  });
  it("never classifies complex analysis candidates as directly promotable", () => {
    for (const dataset of RESEARCH_CANDIDATE_DATASETS) {
      expect(isDirectlyPromotableDataset(dataset)).toBe(false);
    }
    expect(DIRECTLY_PROMOTABLE_DATASETS).toEqual([
      "scam_intel",
      "dead_chains",
      "mid_chains",
      "risk_signals",
    ]);
    expect(isDirectlyPromotableDataset("dead_chains")).toBe(true);
    expect(isProposalDataset("not-a-real-dataset")).toBe(false);
  });
});

describe("sanitizeSlug", () => {
  it("keeps a clean kebab slug", () => {
    expect(sanitizeSlug("ronin-bridge-2022")).toBe("ronin-bridge-2022");
  });
  it("replaces illegal chars and collapses runs", () => {
    expect(sanitizeSlug("Foo Bar! @#Baz")).toBe("foo-bar-baz");
  });
  it("truncates to 80 chars", () => {
    expect(sanitizeSlug("a".repeat(200)).length).toBe(80);
  });
  it("trims leading/trailing separators", () => {
    expect(sanitizeSlug("--hi--")).toBe("hi");
  });
});

describe("buildRecord", () => {
  it("stamps needs_human_review + queued_at and preserves fields", () => {
    const rec = buildRecord(
      { dataset: "scam_intel", slug: "x", names_individuals: false, confidence: 0.9, title: "t" },
      "2026-07-14T00:00:00.000Z"
    );
    expect(rec.needs_human_review).toBe(false);
    expect(rec.queued_at).toBe("2026-07-14T00:00:00.000Z");
    expect(rec.title).toBe("t");
    expect(rec.dataset).toBe("scam_intel");
  });
  it("high-risk record is flagged for review", () => {
    const rec = buildRecord({ slug: "y", names_individuals: true, confidence: 0.99 }, "2026-07-14T00:00:00.000Z");
    expect(rec.needs_human_review).toBe(true);
  });
  it("stamps a high-confidence lifecycle candidate as review-required", () => {
    const rec = buildRecord(
      { dataset: "nft_lifecycle_candidate", slug: "azuki-lifecycle", names_individuals: false, confidence: 1 },
      "2026-07-29T00:00:00.000Z"
    );
    expect(rec.needs_human_review).toBe(true);
  });
});

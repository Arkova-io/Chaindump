import { describe, expect, it } from "vitest";
import { DEFAULT_GEMINI_MODEL, isSafePublicUrl, resolveDeskProvider } from "../src/gemini.js";

describe("Gemini research provider safety", () => {
  it("defaults to the low-cost Gemini path and never silently accepts an unknown provider", () => {
    expect(resolveDeskProvider(undefined)).toBe("gemini");
    expect(resolveDeskProvider(" GEMINI ")).toBe("gemini");
    expect(() => resolveDeskProvider("openai")).toThrow(/Unsupported DESK_PROVIDER/);
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-2.5-flash-lite");
  });

  it("only permits public HTTPS source fetches", () => {
    expect(isSafePublicUrl("https://chaindump.xyz/api/chains")).toBe(true);
    expect(isSafePublicUrl("http://example.com")).toBe(false);
    expect(isSafePublicUrl("https://localhost:8787/private")).toBe(false);
    expect(isSafePublicUrl("https://127.0.0.1/metadata")).toBe(false);
    expect(isSafePublicUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
  });
});

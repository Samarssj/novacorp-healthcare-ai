import { describe, expect, it } from "vitest";

describe("GEMINI_API_KEY", () => {
  it.skipIf(!process.env.GEMINI_API_KEY)("authenticates against the Gemini model catalog", async () => {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(process.env.GEMINI_API_KEY ?? "")}`);
    expect(response.ok).toBe(true);
  });
});

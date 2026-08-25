import { describe, expect, it } from "vitest";
import { generateGeminiStructured } from "./gemini";

describe("external Gemini structured adapter", () => {
  it.skipIf(!process.env.GEMINI_API_KEY)("returns schema-conformant JSON from the server-side Gemini API", async () => {
    const result = await generateGeminiStructured({
      schemaName: "adapter_smoke",
      schema: {
        type: "object",
        properties: { route: { type: "string", enum: ["patient"] } },
        required: ["route"],
        additionalProperties: false,
      },
      system: "Return the requested JSON object only.",
      user: "Classify this as patient.",
      maxTokens: 512,
    });
    expect(result).toEqual({ route: "patient" });
  }, 20_000);
});

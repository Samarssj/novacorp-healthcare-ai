import { invokeLLM } from "../_core/llm";

type StructuredGeminiRequest = {
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  maxTokens?: number;
};

function parseGeminiText(payload: unknown) {
  const response = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = response.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned no structured response.");
  const json = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  return JSON.parse(json) as unknown;
}

/**
 * Uses the external Gemini API when GEMINI_API_KEY is configured (for Render and
 * other external hosts), otherwise falls back to the platform-provided model proxy.
 */
export async function generateGeminiStructured({ schemaName, schema, system, user, maxTokens = 1200 }: StructuredGeminiRequest): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json",
          responseJsonSchema: schema,
        },
      }),
    });
    if (!response.ok) throw new Error(`Gemini request failed with ${response.status}.`);
    return parseGeminiText(await response.json());
  }

  const response = await invokeLLM({
    model: "gemini-3.1-pro-preview",
    max_tokens: maxTokens,
    response_format: {
      type: "json_schema",
      json_schema: { name: schemaName, strict: true, schema },
    },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return JSON.parse(String(response.choices[0]?.message.content ?? "")) as unknown;
}

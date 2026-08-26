import { describe, expect, it } from "vitest";
import { buildEphemeralAudioDataUrl, runVoiceFallback } from "./voiceFallback";

describe("voice transcription fallback payload", () => {
  it("creates a bounded, ephemeral audio data URL for the transcription service", () => {
    const dataUrl = buildEphemeralAudioDataUrl({ mimeType: "audio/webm", audioBase64: "UklGRkFBQUFBQUFBQUFBQQ==" });
    expect(dataUrl).toBe("data:audio/webm;base64,UklGRkFBQUFBQUFBQUFBQQ==");
  });

  it("accepts recorded data URLs that include a codec parameter", () => {
    const dataUrl = buildEphemeralAudioDataUrl({ mimeType: "audio/webm", audioBase64: "data:audio/webm;codecs=opus;base64,UklGRkFBQUFBQUFBQUFBQQ==" });
    expect(dataUrl).toBe("data:audio/webm;base64,UklGRkFBQUFBQUFBQUFBQQ==");
  });

  it("returns a controlled successful transcription through the fallback adapter", async () => {
    const result = await runVoiceFallback(
      { mimeType: "audio/webm", audioBase64: "UklGRkFBQUFBQUFBQUFBQQ==", language: "es" },
      async options => {
        expect(options.audioUrl).toMatch(/^data:audio\/webm;base64,/);
        expect(options.language).toBe("es");
        expect(options.prompt).toMatch(/Spanish/);
        return { task: "transcribe", language: "en", duration: 1.2, text: "What is my specialist copay?", segments: [] };
      },
    );
    expect(result).toMatchObject({ text: "What is my specialist copay?", language: "en" });
  });

  it("rejects audio payloads that are not valid base64", () => {
    expect(() => buildEphemeralAudioDataUrl({ mimeType: "audio/webm", audioBase64: "not base64 !!!" })).toThrow(/base64/i);
  });

  it("rejects unsupported transcription-language values", () => {
    expect(() => buildEphemeralAudioDataUrl({ mimeType: "audio/webm", audioBase64: "UklGRkFBQUFBQUFBQUFBQQ==", language: "xx" })).toThrow();
  });
});

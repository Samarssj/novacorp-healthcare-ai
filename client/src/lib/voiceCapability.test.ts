import { describe, expect, it } from "vitest";
import { detectVoiceCapability } from "./voiceCapability";

describe("voice capability detection", () => {
  it("prefers browser-native recognition when available", () => {
    expect(detectVoiceCapability({ hasNativeRecognition: true, hasFallbackRecording: true })).toBe("native");
  });

  it("uses the recording fallback when native recognition is unavailable", () => {
    expect(detectVoiceCapability({ hasNativeRecognition: false, hasFallbackRecording: true })).toBe("fallback");
  });

  it("reports voice as unavailable when neither supported path exists", () => {
    expect(detectVoiceCapability({ hasNativeRecognition: false, hasFallbackRecording: false })).toBe("unavailable");
  });
});

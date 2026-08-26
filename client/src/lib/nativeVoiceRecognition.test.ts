import { emptySpeechRetryNotice, isEmptySpeechRecognitionError, nativeRecognitionLocale } from "./nativeVoiceRecognition";
import { describe, expect, it } from "vitest";

describe("native voice-recognition recovery", () => {
  it("uses browser-recognized locales for the selectable transcription languages", () => {
    expect(nativeRecognitionLocale("en")).toBe("en-US");
    expect(nativeRecognitionLocale("hi")).toBe("hi-IN");
  });

  it("treats empty recognition attempts as a retryable state rather than a blocking microphone failure", () => {
    expect(isEmptySpeechRecognitionError("no-speech")).toBe(true);
    expect(isEmptySpeechRecognitionError("aborted")).toBe(true);
    expect(isEmptySpeechRecognitionError("not-allowed")).toBe(false);
    expect(emptySpeechRetryNotice()).toContain("Listening");
  });
});

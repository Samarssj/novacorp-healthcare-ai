import { describe, expect, it } from "vitest";
import { confirmsNoFurtherHelp, decideVoiceSessionResponse, shouldAutoSubmitAfterPause, shouldPromptForVoiceInactivity, VOICE_INACTIVITY_MS } from "./voiceSession";

describe("voice session completion", () => {
  it("uses a ten-second inactivity threshold before checking in", () => {
    expect(VOICE_INACTIVITY_MS).toBe(10_000);
  });

  it("recognizes clear no-further-help confirmations", () => {
    expect(confirmsNoFurtherHelp("No thanks")).toBe(true);
    expect(confirmsNoFurtherHelp("End session")).toBe(true);
    expect(confirmsNoFurtherHelp("That's all")).toBe(true);
  });

  it("does not end a session on an affirmative continuation", () => {
    expect(confirmsNoFurtherHelp("Yes, I am still here")).toBe(false);
  });

  it("auto-submits only after detected speech is followed by a natural pause", () => {
    expect(shouldAutoSubmitAfterPause({ elapsedMs: 800, silenceMs: 1_400, hasDetectedSpeech: true })).toBe(true);
    expect(shouldAutoSubmitAfterPause({ elapsedMs: 800, silenceMs: 900, hasDetectedSpeech: true })).toBe(false);
    expect(shouldAutoSubmitAfterPause({ elapsedMs: 800, silenceMs: 2_000, hasDetectedSpeech: false })).toBe(false);
  });

  it("checks in after ten seconds only when an active voice session is genuinely idle", () => {
    expect(shouldPromptForVoiceInactivity({ elapsedMs: 10_000, sessionActive: true, awaitingResponse: false })).toBe(true);
    expect(shouldPromptForVoiceInactivity({ elapsedMs: 9_999, sessionActive: true, awaitingResponse: false })).toBe(false);
    expect(shouldPromptForVoiceInactivity({ elapsedMs: 10_000, sessionActive: true, awaitingResponse: true })).toBe(false);
    expect(shouldPromptForVoiceInactivity({ elapsedMs: 10_000, sessionActive: true, awaitingResponse: false, isListening: true })).toBe(false);
    expect(shouldPromptForVoiceInactivity({ elapsedMs: 10_000, sessionActive: true, awaitingResponse: false, isRecording: true })).toBe(false);
    expect(shouldPromptForVoiceInactivity({ elapsedMs: 10_000, sessionActive: true, awaitingResponse: false, isTranscribing: true })).toBe(false);
    expect(shouldPromptForVoiceInactivity({ elapsedMs: 10_000, sessionActive: true, awaitingResponse: false, isSpeaking: true })).toBe(false);
    expect(shouldPromptForVoiceInactivity({ elapsedMs: 10_000, sessionActive: true, awaitingResponse: false, resumePending: true })).toBe(false);
  });

  it("maps presence answers to continuation or a confirmed session end", () => {
    expect(decideVoiceSessionResponse("No thanks")).toBe("end");
    expect(decideVoiceSessionResponse("Yes, please continue")).toBe("continue");
  });
});

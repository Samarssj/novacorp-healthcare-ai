import { describe, expect, it } from "vitest";
import { FALLBACK_RECORDING_SECONDS, formatRecordingCountdown, remainingRecordingSeconds } from "./voiceRecording";

describe("fallback recording countdown", () => {
  it("starts with the configured duration and reaches zero without becoming negative", () => {
    const startedAt = 1_000;
    expect(remainingRecordingSeconds(startedAt, startedAt)).toBe(FALLBACK_RECORDING_SECONDS);
    expect(remainingRecordingSeconds(startedAt, startedAt + 17_800)).toBe(43);
    expect(remainingRecordingSeconds(startedAt, startedAt + 90_000)).toBe(0);
  });

  it("formats the visible countdown consistently", () => {
    expect(formatRecordingCountdown(60)).toBe("0:60");
    expect(formatRecordingCountdown(9)).toBe("0:09");
    expect(formatRecordingCountdown(0)).toBe("0:00");
  });
});

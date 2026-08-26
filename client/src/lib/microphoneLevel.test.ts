import { describe, expect, it } from "vitest";
import { activeMicrophoneBars, normalizeMicrophoneLevel } from "./microphoneLevel";

describe("microphone level utilities", () => {
  it("maps a quiet waveform to zero and a loud waveform to a bounded percentage", () => {
    expect(normalizeMicrophoneLevel(new Uint8Array([128, 128, 128]))).toBe(0);
    expect(normalizeMicrophoneLevel(new Uint8Array([0, 255, 0, 255]))).toBe(100);
  });

  it("activates progressively more visual meter bars as the level rises", () => {
    expect(activeMicrophoneBars(0)).toEqual([false, false, false, false, false, false, false, false]);
    expect(activeMicrophoneBars(50)).toEqual([true, true, true, true, false, false, false, false]);
    expect(activeMicrophoneBars(100)).toEqual([true, true, true, true, true, true, true, true]);
  });
});

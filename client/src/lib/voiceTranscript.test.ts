import { describe, expect, it, vi } from "vitest";
import { handOffVoiceTranscript } from "./voiceTranscript";

describe("voice transcript handoff", () => {
  it("routes a captured transcript through the same message callback as typed chat", () => {
    const onSendMessage = vi.fn();
    const sent = handOffVoiceTranscript("  NCG-48219  ", onSendMessage, false);
    expect(sent).toBe(true);
    expect(onSendMessage).toHaveBeenCalledWith("NCG-48219");
  });

  it("does not submit blank or concurrent transcripts", () => {
    const onSendMessage = vi.fn();
    expect(handOffVoiceTranscript("   ", onSendMessage, false)).toBe(false);
    expect(handOffVoiceTranscript("What is my copay?", onSendMessage, true)).toBe(false);
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});

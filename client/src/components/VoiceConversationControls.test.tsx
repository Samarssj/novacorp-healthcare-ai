// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    care: {
      signOutPatient: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      transcribeVoice: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import { VoiceConversationControls } from "./VoiceConversationControls";

type RecognitionHandlers = {
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

class FakeSpeechRecognition implements RecognitionHandlers {
  static latest: FakeSpeechRecognition | null = null;
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: RecognitionHandlers["onresult"] = null;
  onerror: RecognitionHandlers["onerror"] = null;
  onend: RecognitionHandlers["onend"] = null;
  start() { FakeSpeechRecognition.latest = this; }
  stop() { this.onend?.(); }
}

describe("VoiceConversationControls native silence recovery", () => {
  beforeEach(() => {
    const browser = window as typeof window & { SpeechRecognition?: typeof FakeSpeechRecognition; webkitSpeechRecognition?: typeof FakeSpeechRecognition };
    browser.SpeechRecognition = FakeSpeechRecognition;
    browser.webkitSpeechRecognition = undefined;
    FakeSpeechRecognition.latest = null;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(["no-speech", "aborted", "ended-without-transcript"])("shows a retry notice, not a blocking error, after a native %s event", async recognitionError => {
    const user = userEvent.setup();
    render(<VoiceConversationControls onTranscript={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));
    expect(FakeSpeechRecognition.latest).not.toBeNull();

    await act(async () => {
      const recognition = FakeSpeechRecognition.latest;
      if (recognitionError === "ended-without-transcript") recognition?.onend?.();
      else if (recognition?.onerror) recognition.onerror({ error: recognitionError });
    });

    expect(screen.getByText(/Nova is ready when you are/i)).toBeTruthy();
    expect(screen.queryByText(/Nova could not hear that/i)).toBeNull();
    expect(screen.queryByText(/Microphone permission is required/i)).toBeNull();
  });
});

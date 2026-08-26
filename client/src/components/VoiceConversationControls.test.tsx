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

class FakeSpeechSynthesisUtterance {
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  rate = 1;
  constructor(public text: string) {}
}

describe("VoiceConversationControls native silence recovery", () => {
  beforeEach(() => {
    const browser = window as typeof window & { SpeechRecognition?: typeof FakeSpeechRecognition; webkitSpeechRecognition?: typeof FakeSpeechRecognition };
    browser.SpeechRecognition = FakeSpeechRecognition;
    browser.webkitSpeechRecognition = undefined;
    FakeSpeechRecognition.latest = null;
    Object.assign(window, { SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel: vi.fn(),
        speak: vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
          utterance.onstart?.();
          utterance.onend?.();
        }),
      },
    });
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

  it("speaks a visible reply only after the member starts a voice turn with Speak to Nova", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const { rerender } = render(<VoiceConversationControls onTranscript={onTranscript} />);

    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));
    await act(async () => {
      FakeSpeechRecognition.latest?.onresult?.({ results: [[{ transcript: "Hi" }]] });
    });
    expect(onTranscript).toHaveBeenCalledWith("Hi");

    rerender(<VoiceConversationControls onTranscript={onTranscript} reply="Welcome to NovaCorp Health. Please share your member ID." />);
    await act(async () => undefined);

    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(window.speechSynthesis.speak).toHaveBeenCalledWith(expect.objectContaining({ text: "Welcome to NovaCorp Health. Please share your member ID." }));
    expect(screen.queryByRole("button", { name: /hear nova/i })).toBeNull();
  });

  it("reports Nova's spoken session-end confirmation prompt to the visible chat callback", async () => {
    const user = userEvent.setup();
    const onAssistantVoiceMessage = vi.fn();
    render(<VoiceConversationControls onTranscript={vi.fn()} onAssistantVoiceMessage={onAssistantVoiceMessage} />);

    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));
    await act(async () => {
      const recognition = FakeSpeechRecognition.latest;
      recognition?.onresult?.({ results: [[{ transcript: "Hello" }]] });
      recognition?.onend?.();
    });
    await user.click(screen.getByRole("button", { name: /end session/i }));

    expect(onAssistantVoiceMessage).toHaveBeenCalledWith(expect.stringMatching(/Would you like to end your care session/i));
  });
});

// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("streamdown", () => ({ Streamdown: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    care: {
      signOutPatient: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      transcribeVoice: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import { AIChatBox, type Message } from "./AIChatBox";

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

function SpeakToNovaHarness() {
  const [messages, setMessages] = useState<Message[]>([]);
  return <AIChatBox
    messages={messages}
    height="320px"
    onSendMessage={content => setMessages(current => [
      ...current,
      { role: "user", content },
      { role: "assistant", content: "Welcome to NovaCorp Health. Please share your member ID." },
    ])}
  />;
}

describe("AIChatBox Speak to Nova flow", () => {
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

  it("hands off a real voice transcript, renders the reply, and speaks it only because Speak to Nova was selected", async () => {
    const user = userEvent.setup();
    render(<SpeakToNovaHarness />);

    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));
    await act(async () => {
      const recognition = FakeSpeechRecognition.latest;
      recognition?.onresult?.({ results: [[{ transcript: "Hi" }]] });
      recognition?.onend?.();
    });

    expect(await screen.findByText("Hi")).toBeTruthy();
    expect(await screen.findByText("Welcome to NovaCorp Health. Please share your member ID.")).toBeTruthy();
    expect(window.speechSynthesis.speak).toHaveBeenCalledWith(expect.objectContaining({ text: "Welcome to NovaCorp Health. Please share your member ID." }));
    expect(screen.queryByRole("button", { name: /hear nova/i })).toBeNull();
  });
});

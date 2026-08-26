// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

function ChatHarness({ initialVoicePrompt }: { initialVoicePrompt?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  return <AIChatBox
    messages={messages}
    onSendMessage={() => undefined}
    initialVoicePrompt={initialVoicePrompt}
    onVoiceAssistantMessage={content => setMessages(current => [...current, { role: "assistant", content }])}
    height="320px"
  />;
}

describe("AIChatBox hands-free verification handoff", () => {
  beforeEach(() => {
    const browser = window as typeof window & { SpeechRecognition?: typeof FakeSpeechRecognition; webkitSpeechRecognition?: typeof FakeSpeechRecognition; __novaHandsFreeSession?: boolean };
    browser.SpeechRecognition = FakeSpeechRecognition;
    browser.webkitSpeechRecognition = undefined;
    browser.__novaHandsFreeSession = false;
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

  it("continues the member-initiated native voice session into the verified workspace", async () => {
    const user = userEvent.setup();
    const verification = render(<ChatHarness initialVoicePrompt="Welcome to NovaCorp Health. Please share your member ID." />);

    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));
    expect(await screen.findByText("Welcome to NovaCorp Health. Please share your member ID.")).toBeTruthy();
    expect((window as typeof window & { __novaHandsFreeSession?: boolean }).__novaHandsFreeSession).toBe(true);
    verification.unmount();

    render(<ChatHarness />);
    await act(async () => undefined);

    expect(await screen.findByText("You are verified. What can I help you with today?")).toBeTruthy();
    expect(window.speechSynthesis.speak).toHaveBeenCalledWith(expect.objectContaining({ text: "You are verified. What can I help you with today?" }));
    await waitFor(() => expect(FakeSpeechRecognition.latest).not.toBeNull());
  });
});

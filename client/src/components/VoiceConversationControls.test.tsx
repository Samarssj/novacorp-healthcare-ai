// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    care: {
      signOutPatient: { useMutation: () => ({ mutate: signOutPatient, isPending: false }) },
      transcribeVoice: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import { VoiceConversationControls } from "./VoiceConversationControls";
import { VOICE_INACTIVITY_MS } from "../lib/voiceSession";

const signOutPatient = vi.fn();

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
    (window as typeof window & { __novaHandsFreeSession?: boolean }).__novaHandsFreeSession = false;
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
    vi.useRealTimers();
    signOutPatient.mockClear();
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

  it("waits ten seconds after a completed no-speech turn before asking whether the member is still there", async () => {
    const user = userEvent.setup();
    render(<VoiceConversationControls onTranscript={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));
    vi.useFakeTimers();
    await act(async () => FakeSpeechRecognition.latest?.onend?.());

    await act(async () => vi.advanceTimersByTime(VOICE_INACTIVITY_MS - 1));
    expect(screen.queryByText(/Nova is checking whether you need anything else/i)).toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    expect(screen.getByText(/Nova is checking whether you need anything else/i)).toBeTruthy();
  });

  it("never starts an inactivity check while native listening is still active", async () => {
    const user = userEvent.setup();
    render(<VoiceConversationControls onTranscript={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));
    vi.useFakeTimers();
    await act(async () => vi.advanceTimersByTime(VOICE_INACTIVITY_MS * 2));

    expect(screen.getByText(/Listening · Nova sends when you pause/i)).toBeTruthy();
    expect(screen.queryByText(/Nova is checking whether you need anything else/i)).toBeNull();
  });

  it("shows an accessible microphone-level meter whenever Nova is actively listening", async () => {
    const user = userEvent.setup();
    render(<VoiceConversationControls onTranscript={vi.fn()} />);

    expect(screen.queryByRole("meter", { name: /microphone level/i })).toBeNull();
    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));

    const meter = screen.getByRole("meter", { name: /microphone level/i });
    expect(meter.getAttribute("aria-valuemin")).toBe("0");
    expect(meter.getAttribute("aria-valuemax")).toBe("100");
    expect(meter.children.length).toBe(8);
  });

  it("clears the microphone meter when a completed native listening turn ends", async () => {
    const user = userEvent.setup();
    render(<VoiceConversationControls onTranscript={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));
    expect(screen.getByRole("meter", { name: /microphone level/i })).toBeTruthy();
    await act(async () => {
      const recognition = FakeSpeechRecognition.latest;
      recognition?.onresult?.({ results: [[{ transcript: "Hello" }]] });
      recognition?.onend?.();
    });

    await waitFor(() => expect(screen.queryByRole("meter", { name: /microphone level/i })).toBeNull());
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

  it("does not check in while native listening has reopened after Nova completes a reply", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const { rerender } = render(<VoiceConversationControls onTranscript={onTranscript} />);

    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));
    await act(async () => FakeSpeechRecognition.latest?.onresult?.({ results: [[{ transcript: "What are my benefits?" }]] }));
    vi.useFakeTimers();
    rerender(<VoiceConversationControls onTranscript={onTranscript} reply="Your plan includes eligible specialist care." />);
    await act(async () => vi.advanceTimersByTime(250));

    expect(screen.getByText(/Listening · Nova sends when you pause/i)).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(VOICE_INACTIVITY_MS * 2));
    expect(screen.queryByText(/Nova is checking whether you need anything else/i)).toBeNull();
  });

  it("speaks Nova's verification greeting immediately when Speak to Nova begins a hands-free session", async () => {
    const user = userEvent.setup();
    const onAssistantVoiceMessage = vi.fn();
    const onVoiceSessionStart = vi.fn();
    render(<VoiceConversationControls onTranscript={vi.fn()} initialVoicePrompt="Welcome to NovaCorp Health. Please share your member ID." onAssistantVoiceMessage={onAssistantVoiceMessage} onVoiceSessionStart={onVoiceSessionStart} />);

    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));

    expect(onVoiceSessionStart).toHaveBeenCalledTimes(1);
    expect(onAssistantVoiceMessage).toHaveBeenCalledWith("Welcome to NovaCorp Health. Please share your member ID.");
    expect(window.speechSynthesis.speak).toHaveBeenCalledWith(expect.objectContaining({ text: "Welcome to NovaCorp Health. Please share your member ID." }));
  });

  it("automatically resumes a persisted hands-free session with a verified-care prompt", async () => {
    const onAssistantVoiceMessage = vi.fn();
    (window as typeof window & { __novaHandsFreeSession?: boolean }).__novaHandsFreeSession = true;
    render(<VoiceConversationControls onTranscript={vi.fn()} initialVoicePrompt="You are verified. What can I help you with today?" onAssistantVoiceMessage={onAssistantVoiceMessage} />);

    expect(await screen.findByText(/end session/i)).toBeTruthy();
    expect(onAssistantVoiceMessage).toHaveBeenCalledWith("You are verified. What can I help you with today?");
    expect(window.speechSynthesis.speak).toHaveBeenCalledWith(expect.objectContaining({ text: "You are verified. What can I help you with today?" }));
  });

  it("carries a member-initiated hands-free session from verification into the verified care prompt", async () => {
    const user = userEvent.setup();
    const verificationVoiceMessage = vi.fn();
    const firstScreen = render(<VoiceConversationControls onTranscript={vi.fn()} initialVoicePrompt="Welcome to NovaCorp Health. Please share your member ID." onAssistantVoiceMessage={verificationVoiceMessage} />);

    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));
    expect(verificationVoiceMessage).toHaveBeenCalledWith("Welcome to NovaCorp Health. Please share your member ID.");
    firstScreen.unmount();

    const careVoiceMessage = vi.fn();
    render(<VoiceConversationControls onTranscript={vi.fn()} initialVoicePrompt="You are verified. What can I help you with today?" onAssistantVoiceMessage={careVoiceMessage} />);

    expect(await screen.findByText(/end session/i)).toBeTruthy();
    expect(careVoiceMessage).toHaveBeenCalledWith("You are verified. What can I help you with today?");
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

    expect(onAssistantVoiceMessage).toHaveBeenCalledWith("Would you like to end your care session? Say yes to end your session, or no to keep it open.");
  });

  it("ends the session when the member says yes to Nova's explicit end-session prompt", async () => {
    const user = userEvent.setup();
    render(<VoiceConversationControls onTranscript={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));
    await act(async () => {
      FakeSpeechRecognition.latest?.onresult?.({ results: [[{ transcript: "Hello" }]] });
      FakeSpeechRecognition.latest?.onend?.();
    });
    await user.click(screen.getByRole("button", { name: /end session/i }));
    await new Promise(resolve => setTimeout(resolve, 275));
    await act(async () => FakeSpeechRecognition.latest?.onresult?.({ results: [[{ transcript: "Yes" }]] }));
    await new Promise(resolve => setTimeout(resolve, 375));

    expect(screen.getByText(/Nova is ending your session/i)).toBeTruthy();
    expect(signOutPatient).toHaveBeenCalledTimes(1);
  });

  it("keeps the session open when the member says no to Nova's explicit end-session prompt", async () => {
    const user = userEvent.setup();
    const onAssistantVoiceMessage = vi.fn();
    render(<VoiceConversationControls onTranscript={vi.fn()} onAssistantVoiceMessage={onAssistantVoiceMessage} />);

    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));
    await act(async () => {
      FakeSpeechRecognition.latest?.onresult?.({ results: [[{ transcript: "Hello" }]] });
      FakeSpeechRecognition.latest?.onend?.();
    });
    await user.click(screen.getByRole("button", { name: /end session/i }));
    await new Promise(resolve => setTimeout(resolve, 275));
    await act(async () => FakeSpeechRecognition.latest?.onresult?.({ results: [[{ transcript: "No, keep it open" }]] }));

    expect(onAssistantVoiceMessage).toHaveBeenCalledWith("I’m still here. What else can I help you with?");
    expect(screen.queryByText(/Nova is ending your session/i)).toBeNull();
    expect(signOutPatient).not.toHaveBeenCalled();
  });
});

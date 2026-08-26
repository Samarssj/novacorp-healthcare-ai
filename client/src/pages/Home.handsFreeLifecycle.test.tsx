// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("streamdown", () => ({ Streamdown: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const patient = {
  id: 1,
  name: "Avery Stone",
  initials: "AS",
  memberId: "NCG-48219",
  plan: "NovaCare Select",
  planStatus: "Active",
  specialistCopay: "$35",
  deductibleRemaining: "$450",
  medications: [],
  allergies: [],
  upcomingAppointment: undefined,
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    care: {
      beginVerificationConversation: { useQuery: () => ({ data: { reply: "Welcome to NovaCorp Health. Please share your member ID." }, isLoading: false }) },
      continueVerificationConversation: { useMutation: (options: { onSuccess?: (result: { reply: string; stage: "verified"; memberId: string; toolCall: string }) => void }) => ({ mutate: () => options.onSuccess?.({ reply: "You are verified.", stage: "verified", memberId: "NCG-48219", toolCall: "verify_member" }), isPending: false, error: null }) },
      getWorkspace: { useQuery: () => ({ data: { patient, initialActivity: [] }, isLoading: false, error: null, refetch: vi.fn() }) },
      signOutPatient: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      transcribeVoice: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      confirmBooking: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      confirmCancellation: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
  },
}));

import Home from "./Home";

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

describe("Home hands-free verification lifecycle", () => {
  beforeEach(() => {
    const browser = window as typeof window & { SpeechRecognition?: typeof FakeSpeechRecognition; webkitSpeechRecognition?: typeof FakeSpeechRecognition; __novaHandsFreeSession?: boolean };
    browser.SpeechRecognition = FakeSpeechRecognition;
    browser.webkitSpeechRecognition = undefined;
    browser.__novaHandsFreeSession = false;
    FakeSpeechRecognition.latest = null;
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
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

  it("greets immediately, completes verification, then speaks the verified care follow-up while native listening remains active", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(await screen.findByRole("button", { name: /speak to nova/i }));
    expect(await screen.findByText("Welcome to NovaCorp Health. Please share your member ID.")).toBeTruthy();
    await waitFor(() => expect(FakeSpeechRecognition.latest).not.toBeNull());
    await act(async () => FakeSpeechRecognition.latest?.onresult?.({ results: [[{ transcript: "NCG-48219" }]] }));

    await waitFor(() => expect(screen.getByText("Care,", { exact: false })).toBeTruthy(), { timeout: 1500 });
    expect(await screen.findByText("You are verified. What can I help you with today?")).toBeTruthy();
    expect(screen.getByText("Welcome to NovaCorp Health. Please share your member ID.")).toBeTruthy();
    expect(screen.getByText("NCG-48219")).toBeTruthy();
    expect(window.speechSynthesis.speak).toHaveBeenCalledWith(expect.objectContaining({ text: "You are verified. What can I help you with today?" }));
    await waitFor(() => expect(FakeSpeechRecognition.latest).not.toBeNull());
  });
});

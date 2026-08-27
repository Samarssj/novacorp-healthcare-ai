// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    care: {
      beginVerificationConversation: { useQuery: () => ({ data: { reply: "Welcome to NovaCorp Health. Please share your member ID." }, isLoading: false }) },
      continueVerificationConversation: {
        useMutation: (options: { onSuccess: (result: unknown) => void }) => ({
          mutate: (input: { message: string }) => options.onSuccess(input.message === "I don't want anything" ? {
            stage: "ended",
            failedAttempts: 0,
            reply: "Understood. I’ll end this verification session now. You can return whenever you need help.",
          } : {
            stage: "escalated",
            failedAttempts: 3,
            reply: "I’m connecting you to a live agent because I couldn’t verify your details after three attempts. This secure verification session is now ending.",
          }),
          isPending: false,
          error: null,
        }),
      },
    },
  },
}));

vi.mock("@/components/AIChatBox", () => ({
  AIChatBox: ({ onSendMessage, onVoiceSessionStart, onVoiceSpeechComplete }: { onSendMessage: (message: string) => void; onVoiceSessionStart?: () => void; onVoiceSpeechComplete?: (content: string) => void }) => <div>
    <button onClick={() => onVoiceSessionStart?.()}>Begin hands-free session</button>
    <button onClick={() => onSendMessage("555-010-9157")}>Submit third failed verification</button>
    <button onClick={() => onSendMessage("I don't want anything")}>Request verification exit</button>
    <button onClick={() => onVoiceSpeechComplete?.("I’m connecting you to a live agent because I couldn’t verify your details after three attempts. This secure verification session is now ending.")}>Complete spoken handoff</button>
    <button onClick={() => onVoiceSpeechComplete?.("Understood. I’ll end this verification session now. You can return whenever you need help.")}>Complete spoken exit</button>
  </div>,
}));

import { MemberAccess } from "./Home";

describe("MemberAccess live-agent escalation", () => {
  afterEach(cleanup);

  it("shows a live-agent handoff and removes further verification input after the third failed attempt", async () => {
    const user = userEvent.setup();
    render(<MemberAccess onVerified={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /submit third failed verification/i }));

    expect(await screen.findByText(/Connecting you to a live agent/i)).toBeTruthy();
    expect(screen.getByText(/secure verification session has ended/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /submit third failed verification/i })).toBeNull();
  });

  it("keeps the voice conversation mounted until Nova completes the spoken live-agent handoff", async () => {
    const user = userEvent.setup();
    render(<MemberAccess onVerified={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /begin hands-free session/i }));
    await user.click(screen.getByRole("button", { name: /submit third failed verification/i }));
    expect(screen.queryByText(/Connecting you to a live agent/i)).toBeNull();
    expect(screen.getByRole("button", { name: /complete spoken handoff/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /complete spoken handoff/i }));
    expect(await screen.findByText(/Connecting you to a live agent/i)).toBeTruthy();
  });

  it("stops active voice capture as soon as an escalated or ended verification response is accepted", async () => {
    const user = userEvent.setup();
    const stopCapture = vi.fn();
    window.addEventListener("novacorp:stop-voice-capture", stopCapture);
    try {
      render(<MemberAccess onVerified={vi.fn()} />);
      await user.click(screen.getByRole("button", { name: /submit third failed verification/i }));
      expect(stopCapture).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("novacorp:stop-voice-capture", stopCapture);
    }
  });

  it("keeps the courteous verification-exit farewell mounted until speech finishes, then clears hands-free state", async () => {
    const user = userEvent.setup();
    (window as typeof window & { __novaHandsFreeSession?: boolean }).__novaHandsFreeSession = true;
    render(<MemberAccess onVerified={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /begin hands-free session/i }));
    await user.click(screen.getByRole("button", { name: /request verification exit/i }));
    expect(screen.queryByText(/Verification session ended/i)).toBeNull();
    expect(screen.getByRole("button", { name: /complete spoken exit/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /complete spoken exit/i }));
    expect(await screen.findByText(/Verification session ended/i)).toBeTruthy();
    expect((window as typeof window & { __novaHandsFreeSession?: boolean }).__novaHandsFreeSession).toBe(false);
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const greeting = "Welcome to NovaCorp Health. Please share your member ID.";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    care: {
      beginVerificationConversation: { useQuery: () => ({ data: { reply: greeting }, isLoading: false }) },
      continueVerificationConversation: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
  },
}));

vi.mock("@/components/AIChatBox", () => ({
  AIChatBox: ({ messages, onSendMessage, placeholder, initialVoicePrompt, onVoiceSessionStart, onVoiceAssistantMessage }: { messages: Array<{ role: string; content: string }>; onSendMessage: (message: string) => void; placeholder: string; initialVoicePrompt?: string; onVoiceSessionStart?: () => void; onVoiceAssistantMessage?: (content: string) => void }) => (
    <div>
      {messages.map((message, index) => <p key={index}>{message.content}</p>)}
      <button onClick={() => { onVoiceSessionStart?.(); if (initialVoicePrompt) onVoiceAssistantMessage?.(initialVoicePrompt); }}>Speak to Nova</button>
      <input placeholder={placeholder} onKeyDown={event => {
        if (event.key === "Enter") onSendMessage(event.currentTarget.value);
      }} />
    </div>
  ),
}));

import { MemberAccess } from "./Home";

describe("MemberAccess voice greeting", () => {
  afterEach(cleanup);

  it("writes Nova's verification greeting when the member selects Speak to Nova", async () => {
    const user = userEvent.setup();
    const onVoiceSessionStart = vi.fn();
    render(<MemberAccess onVerified={vi.fn()} onVoiceSessionStart={onVoiceSessionStart} />);

    expect(screen.queryByText(greeting)).toBeNull();
    await user.click(screen.getByRole("button", { name: /speak to nova/i }));

    expect(await screen.findByText(greeting)).toBeTruthy();
    expect(onVoiceSessionStart).toHaveBeenCalledTimes(1);
  });
});

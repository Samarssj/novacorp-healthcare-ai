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
  AIChatBox: ({ messages, onSendMessage, placeholder }: { messages: Array<{ role: string; content: string }>; onSendMessage: (message: string) => void; placeholder: string }) => (
    <div>
      {messages.map((message, index) => <p key={index}>{message.content}</p>)}
      <input placeholder={placeholder} onKeyDown={event => {
        if (event.key === "Enter") onSendMessage(event.currentTarget.value);
      }} />
    </div>
  ),
}));

import { MemberAccess } from "./Home";

describe("MemberAccess greeting", () => {
  afterEach(cleanup);

  it("keeps Nova's greeting out of the chat until the member says hi", async () => {
    const user = userEvent.setup();
    render(<MemberAccess onVerified={vi.fn()} />);

    expect(screen.queryByText(greeting)).toBeNull();
    const input = screen.getByPlaceholderText("Say hi to begin…");
    await user.type(input, "hi{enter}");

    expect(await screen.findByText(greeting)).toBeTruthy();
    expect(screen.getByText("hi")).toBeTruthy();
  });
});

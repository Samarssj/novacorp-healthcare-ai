// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

let responseIndex = 0;
const responses = [
  { stage: "awaiting_phone" as const, memberId: "NCG-48219", failedAttempts: 0, reply: "Thank you. Please enter the mobile number associated with that member ID." },
  { stage: "awaiting_phone" as const, memberId: "NCG-48219", failedAttempts: 1, reply: "I couldn’t verify that mobile number for the member ID already provided. Please re-enter the associated mobile number." },
];

vi.mock("@/lib/trpc", () => ({
  trpc: {
    care: {
      beginVerificationConversation: { useQuery: () => ({ data: { reply: "Welcome to NovaCorp Health. Please share your member ID." }, isLoading: false }) },
      continueVerificationConversation: { useMutation: (options: { onSuccess?: (result: typeof responses[number]) => void }) => ({ mutate: () => options.onSuccess?.(responses[responseIndex++]!), isPending: false, error: null }) },
    },
  },
}));

vi.mock("@/components/AIChatBox", () => ({
  AIChatBox: ({ messages, onSendMessage, placeholder }: { messages: Array<{ content: string }>; onSendMessage: (message: string) => void; placeholder: string }) => <div>
    <button onClick={() => onSendMessage(placeholder.includes("member ID") ? "NCG-48219" : "555-010-9157")}>{placeholder.includes("member ID") ? "Send member ID" : "Send mobile number"}</button>
    <input aria-label="Current verification prompt" placeholder={placeholder} readOnly />
    {messages.map((message, index) => <p key={index}>{message.content}</p>)}
  </div>,
}));

import { MemberAccess } from "./Home";

describe("MemberAccess mobile retry", () => {
  afterEach(() => { cleanup(); responseIndex = 0; });

  it("keeps the member ID and requests only the mobile number after a failed mobile verification", async () => {
    const user = userEvent.setup();
    render(<MemberAccess onVerified={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /send member id/i }));
    await waitFor(() => expect(screen.getByPlaceholderText(/mobile number/i)).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /send mobile number/i }));

    expect(await screen.findByText(/couldn’t verify that mobile number/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/mobile number/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/member id/i)).toBeNull();
  });
});

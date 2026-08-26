// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("streamdown", () => ({ Streamdown: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const signOut = vi.fn();
const eventSource = vi.fn();
const patient = { id: 1, name: "Avery Stone", initials: "AS", memberId: "NCG-48219", plan: "NovaCare Select", planStatus: "Active", specialistCopay: "$35", deductibleRemaining: "$450", medications: [], allergies: [], upcomingAppointment: undefined };

vi.mock("@/lib/trpc", () => ({
  trpc: {
    care: {
      beginVerificationConversation: { useQuery: () => ({ data: { reply: "Welcome to NovaCorp Health. Please share your member ID." }, isLoading: false }) },
      continueVerificationConversation: { useMutation: (options: { onSuccess?: (result: unknown) => void }) => ({ mutate: () => options.onSuccess?.({ stage: "verified", failedAttempts: 0, memberId: "NCG-48219", toolCall: "verify_member", patient: { id: "patient-avery", name: "Avery Stone", memberId: "NCG-48219", plan: "NovaCare Select" }, reply: "Verified." }), isPending: false, error: null }) },
      getWorkspace: { useQuery: () => ({ data: { patient, initialActivity: [] }, isLoading: false, error: null, refetch: vi.fn() }) },
      signOutPatient: { useMutation: () => ({ mutate: signOut, isPending: false }) },
      transcribeVoice: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      confirmBooking: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      confirmCancellation: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
  },
}));

vi.mock("@/components/AIChatBox", () => ({
  AIChatBox: ({ onSendMessage, messages, placeholder }: { onSendMessage: (message: string) => void; messages: Array<{ content: string }>; placeholder?: string }) => <div>
    {placeholder?.includes("benefits") ? <>
      <button onClick={() => onSendMessage("Ok thanks, have a great day")}>Send courteous closure</button>
      <button onClick={() => onSendMessage("Help me book an appointment.")}>Send booking request</button>
      <button onClick={() => onSendMessage("and the session")}>Send partial end session</button>
    </> : <button onClick={() => onSendMessage("NCG-48219")}>Verify member</button>}
    {messages.map((message, index) => <p key={index}>{message.content}</p>)}
  </div>,
}));

import Home from "./Home";

describe("verified typed session closure", () => {
  afterEach(() => { cleanup(); signOut.mockClear(); eventSource.mockClear(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("ends a verified session after a courteous closure statement without sending it to care orchestration", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("EventSource", eventSource);
    render(<Home />);

    await user.click(await screen.findByRole("button", { name: /verify member/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /send courteous closure/i })).toBeTruthy());
    expect(screen.getByText("Verified.")).toBeTruthy();
    expect(screen.getByText(/medication list, allergies, cited policy evidence/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /send courteous closure/i }));

    expect(await screen.findByText(/Your care session is now ending/i)).toBeTruthy();
    expect(eventSource).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 700));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("keeps a normal booking request in the guarded coordinator flow rather than treating it as a closure", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("EventSource", eventSource.mockImplementation(() => ({ addEventListener: vi.fn(), close: vi.fn() })));
    render(<Home />);

    await user.click(await screen.findByRole("button", { name: /verify member/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /send booking request/i })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /send booking request/i }));

    expect(eventSource).toHaveBeenCalledWith(expect.stringContaining("Help%20me%20book%20an%20appointment"));
    expect(signOut).not.toHaveBeenCalled();
  });

  it("ends a typed confirmed session on the partial phrase without opening a coordinator stream", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("EventSource", eventSource);
    render(<Home />);

    await user.click(await screen.findByRole("button", { name: /verify member/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /send partial end session/i })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /^end session$/i }));
    expect(await screen.findByText(/Say yes to end your session/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /send partial end session/i }));

    expect(await screen.findByText(/Your care session is now ending/i)).toBeTruthy();
    expect(eventSource).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 700));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("streamdown", () => ({ Streamdown: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

vi.mock("./VoiceConversationControls", () => ({
  VoiceConversationControls: ({ onTranscript, onAssistantVoiceMessage }: { onTranscript: (text: string) => void; onAssistantVoiceMessage?: (text: string) => void }) => (
    <div>
      <button onClick={() => onTranscript("Hi")}>Simulate member voice</button>
      <button onClick={() => onAssistantVoiceMessage?.("Are you still there?")}>Simulate Nova voice prompt</button>
    </div>
  ),
}));

import { AIChatBox, type Message } from "./AIChatBox";

function VoiceChatHarness() {
  const [messages, setMessages] = useState<Message[]>([]);
  return <AIChatBox
    messages={messages}
    onSendMessage={content => setMessages(current => [...current, { role: "user", content }])}
    onVoiceAssistantMessage={content => setMessages(current => [...current, { role: "assistant", content }])}
    height="320px"
  />;
}

describe("AIChatBox voice-session visibility", () => {
  afterEach(cleanup);

  it("keeps the member transcript and Nova's spoken prompt visible in the same chat", async () => {
    const user = userEvent.setup();
    render(<VoiceChatHarness />);

    await user.click(screen.getByRole("button", { name: /simulate member voice/i }));
    await user.click(screen.getByRole("button", { name: /simulate nova voice prompt/i }));

    expect(screen.getByText("Hi")).toBeTruthy();
    expect(screen.getByText("Are you still there?")).toBeTruthy();
  });
});

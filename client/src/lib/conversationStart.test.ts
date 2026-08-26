import { describe, expect, it } from "vitest";
import { isConversationGreeting } from "./conversationStart";

describe("member-initiated conversation start", () => {
  it("recognizes a concise spoken or typed greeting", () => {
    expect(isConversationGreeting("hi")).toBe(true);
    expect(isConversationGreeting("Hello!")).toBe(true);
    expect(isConversationGreeting("hey")).toBe(true);
  });

  it("does not treat a member ID or care request as a conversation greeting", () => {
    expect(isConversationGreeting("NCG-48219")).toBe(false);
    expect(isConversationGreeting("What is my copay?")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { continueMemberConversation, executeMemberVerificationTool } from "./memberVerification";

describe("AI-led member verification conversation", () => {
  it("collects the member ID before requesting a mobile number", async () => {
    const result = await continueMemberConversation({ stage: "awaiting_member_id", message: " ncg-48219 " });
    expect(result).toMatchObject({ stage: "awaiting_phone", memberId: "NCG-48219" });
    expect(result.reply).toMatch(/mobile number/i);
  });

  it("does not verify a member until both credentials have been supplied", async () => {
    const result = await continueMemberConversation({ stage: "awaiting_member_id", message: "NCG-48219" });
    expect(result.toolCall).toBeUndefined();
  });
});

describe.runIf(Boolean(process.env.DATABASE_URL))("AI-led member verification tool handoff", () => {
  it("calls the typed backend verification tool and returns the verified member", async () => {
    const result = await executeMemberVerificationTool({ memberId: "NCG-48219", phoneNumber: "555-010-4821" });
    expect(result).toMatchObject({ id: "patient-avery", memberId: "NCG-48219" });
  });

  it("creates a verified conversation result only after the tool accepts both credentials", async () => {
    const result = await continueMemberConversation({ stage: "awaiting_phone", memberId: "NCG-48219", message: "555-010-4821" });
    expect(result).toMatchObject({ stage: "verified", toolCall: "verify_member", patient: { id: "patient-avery" } });
  });

  it("returns to member-ID collection after a failed verification tool call", async () => {
    const result = await continueMemberConversation({ stage: "awaiting_phone", memberId: "NCG-48219", message: "555-010-9157" });
    expect(result).toMatchObject({ stage: "awaiting_member_id" });
    expect(result.reply).toMatch(/couldn’t verify/i);
  });
});

import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { continueMemberConversation, executeMemberVerificationTool } from "./memberVerification";
import { createPatientSession, PATIENT_SESSION_COOKIE } from "./session";

describe("AI-led member verification conversation", () => {
  it("exposes the greeting-first conversation procedure through the care router", async () => {
    const caller = appRouter.createCaller({} as TrpcContext);
    const greeting = await caller.care.beginVerificationConversation();
    expect(greeting).toMatchObject({ stage: "awaiting_member_id" });
    expect(greeting.reply).toMatch(/member ID/i);
  });

  it("collects the member ID before requesting a mobile number", async () => {
    const result = await continueMemberConversation({ stage: "awaiting_member_id", message: " ncg-48219 " });
    expect(result).toMatchObject({ stage: "awaiting_phone", memberId: "NCG-48219" });
    expect(result.reply).toMatch(/mobile number/i);
  });

  it("processes a voice transcript through the same verification state transition as typed text", async () => {
    const voiceTranscript = "NCG-48219";
    const result = await continueMemberConversation({ stage: "awaiting_member_id", message: voiceTranscript });
    expect(result).toMatchObject({ stage: "awaiting_phone", memberId: "NCG-48219" });
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

  it("uses the verified session for a positive patient-scoped workspace request", async () => {
    const token = await createPatientSession("patient-avery");
    const caller = appRouter.createCaller({ req: { headers: { cookie: `${PATIENT_SESSION_COOKIE}=${token}` } } } as TrpcContext);
    const workspace = await caller.care.getWorkspace();
    expect(workspace.patient).toMatchObject({ id: "patient-avery", memberId: "NCG-48219" });
  });
});

describe("care-message session boundary", () => {
  it("rejects a transcript-equivalent care request without a verified patient session", async () => {
    const caller = appRouter.createCaller({ req: { headers: { cookie: "" } } } as TrpcContext);
    await expect(caller.care.sendMessage({ message: "What is my specialist copay?" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

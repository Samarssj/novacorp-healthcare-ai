import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { continueMemberConversation, executeMemberVerificationTool } from "./memberVerification";
import { createPatientSession, createVerificationAttemptToken, PATIENT_SESSION_COOKIE, VERIFICATION_ATTEMPTS_COOKIE } from "./session";

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

  it("normalizes a spoken member ID with spaces into its canonical form", async () => {
    const result = await continueMemberConversation({ stage: "awaiting_member_id", message: "ncg 48219" });
    expect(result).toMatchObject({ stage: "awaiting_phone", memberId: "NCG-48219" });
  });

  it("does not mistake a phone-like value for a new member ID after a failed attempt", async () => {
    const result = await continueMemberConversation({ stage: "awaiting_member_id", message: "5550 104821", failedAttempts: 1 });
    expect(result).toMatchObject({ stage: "awaiting_member_id", failedAttempts: 1 });
    expect(result.reply).toMatch(/not a mobile number/i);
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

  it("preserves member-ID then mobile-number collection before each verification tool call", async () => {
    const memberIdStep = await continueMemberConversation({ stage: "awaiting_member_id", message: "NCG-48219" });
    expect(memberIdStep).toMatchObject({ stage: "awaiting_phone", memberId: "NCG-48219", failedAttempts: 0 });
    expect(memberIdStep.toolCall).toBeUndefined();
  });
});

describe.runIf(Boolean(process.env.DATABASE_URL))("AI-led member verification tool handoff", () => {
  it("calls the typed backend verification tool and returns the verified member", async () => {
    const result = await executeMemberVerificationTool({ memberId: "NCG-48219", phoneNumber: "555-010-4821" });
    expect(result).toMatchObject({ id: "patient-avery", memberId: "NCG-48219" });
  });

  it("verifies every published demonstration member and normalized mobile pair", async () => {
    const results = await Promise.all([
      executeMemberVerificationTool({ memberId: "NCG 48219", phoneNumber: "555010 4821" }),
      executeMemberVerificationTool({ memberId: "NCG-91577", phoneNumber: "555 010 9157" }),
      executeMemberVerificationTool({ memberId: "NCS76064", phoneNumber: "555-010-7606" }),
    ]);
    expect(results.map(result => result.id)).toEqual(["patient-avery", "patient-maya", "patient-jordan"]);
  });

  it("creates a verified conversation result only after the tool accepts both credentials", async () => {
    const result = await continueMemberConversation({ stage: "awaiting_phone", memberId: "NCG-48219", message: "555-010-4821" });
    expect(result).toMatchObject({ stage: "verified", toolCall: "verify_member", patient: { id: "patient-avery" } });
  });

  it("accepts the reported spaced Avery demonstration credentials", async () => {
    const memberStep = await continueMemberConversation({ stage: "awaiting_member_id", message: "ncg 48219" });
    const result = await continueMemberConversation({ stage: "awaiting_phone", memberId: memberStep.memberId, message: "555010 4821" });
    expect(result).toMatchObject({ stage: "verified", memberId: "NCG-48219", patient: { id: "patient-avery" } });
  });

  it("retains the captured member ID and requests only a corrected mobile number after a failed verification tool call", async () => {
    const result = await continueMemberConversation({ stage: "awaiting_phone", memberId: "NCG-48219", message: "555-010-9157" });
    expect(result).toMatchObject({ stage: "awaiting_phone", memberId: "NCG-48219", failedAttempts: 1 });
    expect(result.reply).toMatch(/couldn’t verify/i);
    expect(result.reply).toMatch(/mobile number/i);
    expect(result.reply).not.toMatch(/re-enter your member id/i);
  });

  it("escalates to a live agent after the third failed paired verification", async () => {
    const first = await continueMemberConversation({ stage: "awaiting_phone", memberId: "NCG-48219", message: "555-010-9157", failedAttempts: 0 });
    const second = await continueMemberConversation({ stage: "awaiting_phone", memberId: "NCG-48219", message: "555-010-9157", failedAttempts: first.failedAttempts });
    const third = await continueMemberConversation({ stage: "awaiting_phone", memberId: "NCG-48219", message: "555-010-9157", failedAttempts: second.failedAttempts });
    expect(first).toMatchObject({ stage: "awaiting_phone", memberId: "NCG-48219", failedAttempts: 1 });
    expect(second).toMatchObject({ stage: "awaiting_phone", memberId: "NCG-48219", failedAttempts: 2 });
    expect(third).toMatchObject({ stage: "escalated", failedAttempts: 3 });
    expect(third.reply).toMatch(/live agent/i);
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

describe("patient session ending", () => {
  it("clears the verified patient cookie through the dedicated care sign-out operation", async () => {
    const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
    const caller = appRouter.createCaller({
      req: { protocol: "https", headers: {} },
      res: { clearCookie: (name: string, options: Record<string, unknown>) => cleared.push({ name, options }) },
    } as TrpcContext);
    await expect(caller.care.signOutPatient()).resolves.toEqual({ success: true });
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toMatchObject({ name: PATIENT_SESSION_COOKIE, options: { maxAge: -1 } });
  });

  it.runIf(Boolean(process.env.DATABASE_URL))("uses the signed failure counter to escalate even if a client resets its reported attempt count", async () => {
    const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
    const attemptsToken = await createVerificationAttemptToken(2);
    const caller = appRouter.createCaller({
      req: { protocol: "https", headers: { cookie: `${VERIFICATION_ATTEMPTS_COOKIE}=${attemptsToken}` } },
      res: { clearCookie: (name: string, options: Record<string, unknown>) => cleared.push({ name, options }) },
    } as TrpcContext);
    const result = await caller.care.continueVerificationConversation({ stage: "awaiting_phone", memberId: "NCG-48219", message: "555-010-9157", failedAttempts: 0 });
    expect(result).toMatchObject({ stage: "escalated", failedAttempts: 3 });
    expect(cleared).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: PATIENT_SESSION_COOKIE, options: expect.objectContaining({ maxAge: -1 }) }),
      expect.objectContaining({ name: VERIFICATION_ATTEMPTS_COOKIE, options: expect.objectContaining({ maxAge: -1 }) }),
    ]));
  });
});

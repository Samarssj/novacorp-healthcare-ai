import { z } from "zod";
import { normalizeMemberId, normalizePhoneNumber, verifyPatientCredentials } from "./careData";

export const memberVerificationInputs = {
  verify_member: z.object({
    memberId: z.string().trim().min(5).max(64),
    phoneNumber: z.string().trim().min(8).max(32),
  }).strict(),
} as const;

export type MemberConversationStage = "awaiting_member_id" | "awaiting_phone" | "verified";

export type MemberConversationResult = {
  stage: MemberConversationStage;
  reply: string;
  memberId?: string;
  patient?: { id: string; name: string; memberId: string; plan: string };
  toolCall?: "verify_member";
};

/**
 * The AI-led access flow is intentionally deterministic around credentials. It
 * asks for one credential at a time, then invokes the typed verification tool.
 * The language model never authenticates a member or receives a mobile number.
 */
export async function continueMemberConversation(input: { stage: MemberConversationStage; message: string; memberId?: string }): Promise<MemberConversationResult> {
  if (input.stage === "awaiting_member_id") {
    const memberId = normalizeMemberId(input.message);
    if (memberId.length < 5) {
      return { stage: "awaiting_member_id", reply: "I need the member ID from your NovaCorp Health card to continue." };
    }
    return { stage: "awaiting_phone", memberId, reply: "Thank you. Please enter the mobile number associated with that member ID." };
  }

  if (input.stage === "awaiting_phone") {
    if (!input.memberId) throw new Error("A member ID is required before mobile verification.");
    try {
      const phoneNumber = normalizePhoneNumber(input.message);
      const verified = await executeMemberVerificationTool({ memberId: input.memberId, phoneNumber });
      return {
        stage: "verified",
        memberId: verified.memberId,
        patient: { id: verified.id, name: verified.name, memberId: verified.memberId, plan: verified.plan },
        toolCall: "verify_member",
        reply: `You’re verified, ${verified.name.split(" ")[0]}. I’m opening your private care workspace now.`
      };
    } catch {
      return { stage: "awaiting_member_id", reply: "I couldn’t verify those details. Please re-enter your member ID to try again." };
    }
  }

  return { stage: "verified", reply: "Your care workspace is already open." };
}

export async function executeMemberVerificationTool(input: unknown) {
  const args = memberVerificationInputs.verify_member.parse(input);
  return verifyPatientCredentials(args.memberId, args.phoneNumber);
}

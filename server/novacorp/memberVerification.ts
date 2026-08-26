import { z } from "zod";
import { isValidMemberId, normalizeMemberId, normalizePhoneNumber, verifyPatientCredentials } from "./careData";

export const memberVerificationInputs = {
  verify_member: z.object({
    memberId: z.string().trim().min(5).max(64),
    phoneNumber: z.string().trim().min(8).max(32),
  }).strict(),
} as const;

export const MAX_MEMBER_VERIFICATION_ATTEMPTS = 3;

export type MemberConversationStage = "awaiting_member_id" | "awaiting_phone" | "verified" | "escalated" | "ended";

export type MemberConversationResult = {
  stage: MemberConversationStage;
  reply: string;
  failedAttempts: number;
  memberId?: string;
  patient?: { id: string; name: string; memberId: string; plan: string };
  toolCall?: "verify_member";
};

function requestsVerificationExit(message: string) {
  const normalized = message.toLowerCase().replace(/[^a-z\s']/g, " ").replace(/\s+/g, " ").trim();
  return /^(?:i )?(?:do not|don't|dont) (?:want|need|have) (?:anything|anthing|anyting)(?: else| more)?(?: help)?|nothing(?: else)?|no thanks|(?:please )?end(?: the)? session|end|goodbye|bye|that's all|thats all|and the session$/.test(normalized);
}

/**
 * The AI-led access flow is intentionally deterministic around credentials. It
 * asks for one credential at a time, then invokes the typed verification tool.
 * The language model never authenticates a member or receives a mobile number.
 */
export async function continueMemberConversation(input: { stage: MemberConversationStage; message: string; memberId?: string; failedAttempts?: number }): Promise<MemberConversationResult> {
  const failedAttempts = Math.max(0, Math.min(input.failedAttempts ?? 0, MAX_MEMBER_VERIFICATION_ATTEMPTS - 1));
  if (requestsVerificationExit(input.message)) {
    return { stage: "ended", failedAttempts: 0, reply: "Understood. I’ll end this verification session now. You can return whenever you need help." };
  }
  if (input.stage === "awaiting_member_id") {
    const memberId = normalizeMemberId(input.message);
    if (!isValidMemberId(memberId)) {
      return { stage: "awaiting_member_id", failedAttempts, reply: "I need the member ID from your NovaCorp Health card to continue. Please enter the letters and numbers from the member ID, not a mobile number." };
    }
    return { stage: "awaiting_phone", memberId, failedAttempts, reply: "Thank you. Please enter the mobile number associated with that member ID." };
  }

  if (input.stage === "awaiting_phone") {
    if (!input.memberId) throw new Error("A member ID is required before mobile verification.");
    try {
      const phoneNumber = normalizePhoneNumber(input.message);
      const verified = await executeMemberVerificationTool({ memberId: input.memberId, phoneNumber });
      return {
        stage: "verified",
        failedAttempts: 0,
        memberId: verified.memberId,
        patient: { id: verified.id, name: verified.name, memberId: verified.memberId, plan: verified.plan },
        toolCall: "verify_member",
        reply: `You’re verified, ${verified.name.split(" ")[0]}. I’m opening your private care workspace now.`
      };
    } catch {
      const nextFailedAttempts = failedAttempts + 1;
      if (nextFailedAttempts >= MAX_MEMBER_VERIFICATION_ATTEMPTS) {
        return {
          stage: "escalated",
          failedAttempts: MAX_MEMBER_VERIFICATION_ATTEMPTS,
          reply: "I’m connecting you to a live agent because I couldn’t verify your details after three attempts. This secure verification session is now ending.",
        };
      }
      return {
        stage: "awaiting_phone",
        failedAttempts: nextFailedAttempts,
        memberId: input.memberId,
        reply: `I couldn’t verify that mobile number for the member ID already provided. Please re-enter the associated mobile number. You have ${MAX_MEMBER_VERIFICATION_ATTEMPTS - nextFailedAttempts} attempt${MAX_MEMBER_VERIFICATION_ATTEMPTS - nextFailedAttempts === 1 ? "" : "s"} remaining before I connect you to a live agent.`,
      };
    }
  }

  if (input.stage === "escalated") {
    return { stage: "escalated", failedAttempts: MAX_MEMBER_VERIFICATION_ATTEMPTS, reply: "Your secure verification session has ended. A live agent can help with your next steps." };
  }

  if (input.stage === "ended") {
    return { stage: "ended", failedAttempts: 0, reply: "This verification session has ended. You can return whenever you need help." };
  }

  return { stage: "verified", failedAttempts: 0, reply: "Your care workspace is already open." };
}

export async function executeMemberVerificationTool(input: unknown) {
  const args = memberVerificationInputs.verify_member.parse(input);
  return verifyPatientCredentials(args.memberId, args.phoneNumber);
}

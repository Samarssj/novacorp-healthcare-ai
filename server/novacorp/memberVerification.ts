import { z } from "zod";
import { isValidMemberId, normalizeMemberId, normalizePhoneNumber, verifyPatientCredentials } from "./careData";
import { runPythonAdkAccessClarifier } from "./adkRunner";

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

type AccessClarificationIntent = "invalid_member_id" | "invalid_phone" | "end_session" | "live_agent";

function normalizedMessage(message: string) {
  return message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s']/g, " ").replace(/\s+/g, " ").trim();
}

function requestsLiveAgent(message: string) {
  const normalized = normalizedMessage(message);
  return /\b(?:connect|transfer|route|speak|talk|help|need|want|ask)\b.*\b(?:live|living|human|person|representative|agent|someone)\b/.test(normalized)
    || /\b(?:live|living|human|person|representative)\s+agent\b/.test(normalized)
    || /\bi (?:do not|don't|dont) (?:speak|understand|know) (?:english|engels)\b/.test(normalized);
}

function requestsVerificationExit(message: string) {
  const normalized = normalizedMessage(message);
  const words = normalized.split(" ").filter(Boolean);
  const looksLikeSpeechToTextClosing = normalized.includes("session") && words.some(word => /^(?:end|ended|ending|close|closed|stop|quit|leave|exit|cancel|jesse|jes|enges|enge|eng|enge[sr]?)$/.test(word));
  const shortAbandonedRequest = /^i (?:do not|don't|dont)(?:\s+(?:need|want|have|know|understand|english|engels))?$/.test(normalized);
  return /^(?:i )?(?:do not|don't|dont) (?:want|need|have) (?:anything|anthing|anyting)(?: else| more)?(?: help)?|nothing(?: else)?|no thanks|(?:please )?end(?: the)? session|end|goodbye|bye|that's all|thats all|and the session$/.test(normalized) || shortAbandonedRequest || looksLikeSpeechToTextClosing;
}

function fallbackAccessReply(intent: AccessClarificationIntent, remainingAttempts = MAX_MEMBER_VERIFICATION_ATTEMPTS) {
  if (intent === "end_session") return "Understood. I’ll end this verification session now. You can return whenever you need help.";
  if (intent === "live_agent") return "I’ll connect you with a live agent now. This verification session is ending.";
  if (intent === "invalid_phone") return `I couldn’t verify that mobile number for the member ID already provided. Please try the associated mobile number again. You have ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining before I connect you to a live agent.`;
  return `I didn’t catch a usable member ID. Please try the letters and numbers on your NovaCorp card, for example NCG-48219. You have ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining before I connect you to a live agent.`;
}

async function composeAccessReply(intent: AccessClarificationIntent, stage: Exclude<MemberConversationStage, "verified">, remainingAttempts?: number) {
  const fallback = fallbackAccessReply(intent, remainingAttempts);
  if (intent === "end_session" || intent === "live_agent" || process.env.NODE_ENV === "test" || process.env.VITEST) return fallback;
  try {
    const result = await runPythonAdkAccessClarifier({ intent, stage, remainingAttempts });
    return result.reply;
  } catch {
    return fallback;
  }
}

/**
 * The AI-led access flow is intentionally deterministic around credentials. It
 * asks for one credential at a time, then invokes the typed verification tool.
 * The language model never authenticates a member or receives a mobile number.
 */
export async function continueMemberConversation(input: { stage: MemberConversationStage; message: string; memberId?: string; failedAttempts?: number }): Promise<MemberConversationResult> {
  const failedAttempts = Math.max(0, Math.min(input.failedAttempts ?? 0, MAX_MEMBER_VERIFICATION_ATTEMPTS - 1));
  if (requestsLiveAgent(input.message)) {
    return { stage: "escalated", failedAttempts: 0, reply: await composeAccessReply("live_agent", "escalated") };
  }
  if (requestsVerificationExit(input.message)) {
    return { stage: "ended", failedAttempts: 0, reply: await composeAccessReply("end_session", "ended") };
  }
  if (input.stage === "awaiting_member_id") {
    const memberId = normalizeMemberId(input.message);
    if (!isValidMemberId(memberId)) {
      const nextFailedAttempts = failedAttempts + 1;
      if (nextFailedAttempts >= MAX_MEMBER_VERIFICATION_ATTEMPTS) {
        return { stage: "escalated", failedAttempts: MAX_MEMBER_VERIFICATION_ATTEMPTS, reply: await composeAccessReply("live_agent", "escalated") };
      }
      return { stage: "awaiting_member_id", failedAttempts: nextFailedAttempts, reply: await composeAccessReply("invalid_member_id", "awaiting_member_id", MAX_MEMBER_VERIFICATION_ATTEMPTS - nextFailedAttempts) };
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
          reply: await composeAccessReply("live_agent", "escalated"),
        };
      }
      return {
        stage: "awaiting_phone",
        failedAttempts: nextFailedAttempts,
        memberId: input.memberId,
        reply: await composeAccessReply("invalid_phone", "awaiting_phone", MAX_MEMBER_VERIFICATION_ATTEMPTS - nextFailedAttempts),
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

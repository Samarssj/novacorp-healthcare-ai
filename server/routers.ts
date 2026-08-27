import { parse } from "cookie";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getOrCreateMemberCard, getPatientWorkspace, registerMember, requestLostMemberCard, updateMemberProfile, verifyPatientCredentials } from "./novacorp/careData";
import { runCoordinator } from "./novacorp/coordinator";
import { continueMemberConversation } from "./novacorp/memberVerification";
import { approvedModelTools, novacorpOpenApi } from "./novacorp/openapi";
import { createPatientSession, createVerificationAttemptToken, PATIENT_SESSION_COOKIE, resolvePatientSession, resolveVerificationAttemptToken, VERIFICATION_ATTEMPTS_COOKIE } from "./novacorp/session";
import { executeApprovedTool } from "./novacorp/tools";
import { transcribeAudio } from "./_core/voiceTranscription";
import { runVoiceFallback, voiceFallbackInput } from "./novacorp/voiceFallback";

const memberVerificationSchema = z.object({
  memberId: z.string().trim().min(5).max(64),
  phoneNumber: z.string().trim().min(8).max(32),
}).strict();

const memberConversationSchema = z.object({
  stage: z.enum(["awaiting_member_id", "awaiting_phone", "verified", "escalated", "ended"]),
  message: z.string().trim().min(1).max(160),
  memberId: z.string().trim().min(5).max(64).optional(),
  failedAttempts: z.number().int().min(0).max(2).optional(),
}).strict();

const postalAddressSchema = z.object({
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(16),
  country: z.string().trim().min(2).max(80),
}).strict();

const memberProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  dateOfBirth: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date of birth in YYYY-MM-DD format.").refine(value => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date <= new Date();
  }, "Enter a valid date of birth."),
  phoneNumber: z.string().trim().min(8).max(32),
  address: postalAddressSchema,
}).strict();

async function requireVerifiedPatient(cookieHeader: string | undefined) {
  const token = parse(cookieHeader ?? "")[PATIENT_SESSION_COOKIE];
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED", message: "Verify your member details to access the care workspace." });
  try {
    return await resolvePatientSession(token);
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Your verified care session has expired. Please verify your member details again." });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  care: router({
    beginVerificationConversation: publicProcedure.query(() => ({
      stage: "awaiting_member_id" as const,
      reply: "Welcome to NovaCorp Health. I’m Nova, your care assistant. To open your private workspace, please enter your member ID.",
    })),
    continueVerificationConversation: publicProcedure.input(memberConversationSchema).mutation(async ({ input, ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      const previousAttempts = await resolveVerificationAttemptToken(parse(ctx.req.headers.cookie ?? "")[VERIFICATION_ATTEMPTS_COOKIE]);
      const result = await continueMemberConversation({ ...input, failedAttempts: previousAttempts });
      if (result.stage === "verified" && result.patient) {
        const token = await createPatientSession(result.patient.id);
        ctx.res.cookie(PATIENT_SESSION_COOKIE, token, { ...cookieOptions, maxAge: 30 * 60 * 1000 });
        ctx.res.clearCookie(VERIFICATION_ATTEMPTS_COOKIE, { ...cookieOptions, maxAge: -1 });
      }
      if (result.stage === "escalated" || result.stage === "ended") {
        ctx.res.clearCookie(PATIENT_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
        ctx.res.clearCookie(VERIFICATION_ATTEMPTS_COOKIE, { ...cookieOptions, maxAge: -1 });
      } else if (result.failedAttempts > 0) {
        const token = await createVerificationAttemptToken(result.failedAttempts);
        ctx.res.cookie(VERIFICATION_ATTEMPTS_COOKIE, token, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
      }
      return result;
    }),
    transcribeVoice: publicProcedure.input(voiceFallbackInput).mutation(async ({ input }) => {
      // Keep fallback audio only in request memory; it is not stored with the patient record.
      const result = await runVoiceFallback(input, transcribeAudio);
      if ("error" in result) throw new TRPCError({ code: "BAD_REQUEST", message: result.error, cause: result });
      return { text: result.text.trim(), language: result.language };
    }),
    verifyMember: publicProcedure.input(memberVerificationSchema).mutation(async ({ input, ctx }) => {
      const patient = await verifyPatientCredentials(input.memberId, input.phoneNumber);
      const token = await createPatientSession(patient.id);
      ctx.res.cookie(PATIENT_SESSION_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: 30 * 60 * 1000 });
      return { patient: { name: patient.name, memberId: patient.memberId, plan: patient.plan } };
    }),
    registerMember: publicProcedure.input(memberProfileSchema).mutation(async ({ input, ctx }) => {
      const patient = await registerMember(input);
      const token = await createPatientSession(patient.id);
      ctx.res.cookie(PATIENT_SESSION_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: 30 * 60 * 1000 });
      return { patient };
    }),
    signOutPatient: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = { ...getSessionCookieOptions(ctx.req), maxAge: -1 };
      ctx.res.clearCookie(PATIENT_SESSION_COOKIE, cookieOptions);
      ctx.res.clearCookie(VERIFICATION_ATTEMPTS_COOKIE, cookieOptions);
      return { success: true } as const;
    }),
    getWorkspace: publicProcedure.query(async ({ ctx }) => {
      const patientId = await requireVerifiedPatient(ctx.req.headers.cookie);
      return getPatientWorkspace(patientId);
    }),
    updateMemberProfile: publicProcedure.input(memberProfileSchema).mutation(async ({ input, ctx }) => {
      const patientId = await requireVerifiedPatient(ctx.req.headers.cookie);
      return updateMemberProfile(patientId, input);
    }),
    createMemberCard: publicProcedure.mutation(async ({ ctx }) => {
      const patientId = await requireVerifiedPatient(ctx.req.headers.cookie);
      return getOrCreateMemberCard(patientId);
    }),
    requestLostMemberCard: publicProcedure.mutation(async ({ ctx }) => {
      const patientId = await requireVerifiedPatient(ctx.req.headers.cookie);
      return requestLostMemberCard(patientId);
    }),
    sendMessage: publicProcedure.input(z.object({ message: z.string().trim().min(1).max(1600) }).strict()).mutation(async ({ input, ctx }) => {
      const patientId = await requireVerifiedPatient(ctx.req.headers.cookie);
      return runCoordinator({ patientId, message: input.message });
    }),
    confirmBooking: publicProcedure.input(z.object({ slotId: z.string().trim().min(1), confirmed: z.literal(true) }).strict()).mutation(async ({ input, ctx }) => {
      const patientId = await requireVerifiedPatient(ctx.req.headers.cookie);
      return executeApprovedTool("book_appointment", { patientId, ...input });
    }),
    confirmCancellation: publicProcedure.input(z.object({ appointmentId: z.string().trim().min(1), confirmed: z.literal(true) }).strict()).mutation(async ({ input, ctx }) => {
      const patientId = await requireVerifiedPatient(ctx.req.headers.cookie);
      return executeApprovedTool("cancel_appointment", { patientId, ...input });
    }),
    openApi: publicProcedure.query(() => novacorpOpenApi),
    approvedTools: publicProcedure.query(() => approvedModelTools),
  }),
});

export type AppRouter = typeof appRouter;

import { parse } from "cookie";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getPatientWorkspace, verifyPatientCredentials } from "./novacorp/careData";
import { runCoordinator } from "./novacorp/coordinator";
import { continueMemberConversation } from "./novacorp/memberVerification";
import { approvedModelTools, novacorpOpenApi } from "./novacorp/openapi";
import { createPatientSession, PATIENT_SESSION_COOKIE, resolvePatientSession } from "./novacorp/session";
import { executeApprovedTool } from "./novacorp/tools";

const memberVerificationSchema = z.object({
  memberId: z.string().trim().min(5).max(64),
  phoneNumber: z.string().trim().min(8).max(32),
}).strict();

const memberConversationSchema = z.object({
  stage: z.enum(["awaiting_member_id", "awaiting_phone", "verified"]),
  message: z.string().trim().min(1).max(160),
  memberId: z.string().trim().min(5).max(64).optional(),
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
      const result = await continueMemberConversation(input);
      if (result.stage === "verified" && result.patient) {
        const token = await createPatientSession(result.patient.id);
        ctx.res.cookie(PATIENT_SESSION_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: 30 * 60 * 1000 });
      }
      return result;
    }),
    verifyMember: publicProcedure.input(memberVerificationSchema).mutation(async ({ input, ctx }) => {
      const patient = await verifyPatientCredentials(input.memberId, input.phoneNumber);
      const token = await createPatientSession(patient.id);
      ctx.res.cookie(PATIENT_SESSION_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: 30 * 60 * 1000 });
      return { patient: { name: patient.name, memberId: patient.memberId, plan: patient.plan } };
    }),
    signOutPatient: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(PATIENT_SESSION_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
    getWorkspace: publicProcedure.query(async ({ ctx }) => {
      const patientId = await requireVerifiedPatient(ctx.req.headers.cookie);
      return getPatientWorkspace(patientId);
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

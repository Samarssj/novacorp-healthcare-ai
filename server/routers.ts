import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { confirmDemoBooking, runCoordinator } from "./novacorp/coordinator";
import { demoWorkspace, getDemoPatient, searchAppointmentAvailability, searchPolicyEvidence } from "./novacorp/demoData";
import { approvedModelTools, novacorpOpenApi } from "./novacorp/openapi";
import { executeApprovedTool } from "./novacorp/tools";

const patientIdSchema = z.literal("patient-demo-001");

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
    getWorkspace: publicProcedure.query(() => demoWorkspace),
    getPatient: publicProcedure.input(patientIdSchema).query(() => getDemoPatient()),
    searchEvidence: publicProcedure.input(z.object({ query: z.string().trim().min(1).max(800) }).strict()).query(({ input }) => searchPolicyEvidence(input.query)),
    searchAvailability: publicProcedure.input(z.object({ query: z.string().trim().min(1).max(800) }).strict()).query(({ input }) => searchAppointmentAvailability(input.query)),
    sendMessage: publicProcedure.input(z.object({ message: z.string().trim().min(1).max(1600) }).strict()).mutation(({ input }) => runCoordinator({ message: input.message })),
    confirmBooking: publicProcedure.input(z.object({ patientId: patientIdSchema, slotId: z.string().trim().min(1), confirmed: z.literal(true) }).strict()).mutation(({ input }) => confirmDemoBooking(input)),
    confirmCancellation: publicProcedure.input(z.object({ patientId: patientIdSchema, appointmentId: z.literal("appointment-demo-pcp-01"), confirmed: z.literal(true) }).strict()).mutation(({ input }) => executeApprovedTool("cancel_appointment", input)),
    openApi: publicProcedure.query(() => novacorpOpenApi),
    approvedTools: publicProcedure.query(() => approvedModelTools),
  }),
});

export type AppRouter = typeof appRouter;

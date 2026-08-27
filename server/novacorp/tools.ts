import { z } from "zod";

/**
 * Edge-only contract schemas. Node validates browser requests before forwarding
 * a signed-session subject and explicit confirmation to the Python core.
 */
const patientIdSchema = z.string().trim().min(3).max(64);

export const approvedOperationInputs = {
  get_patient_summary: z.object({ patientId: patientIdSchema }).strict(),
  search_policy_evidence: z.object({ patientId: patientIdSchema, query: z.string().trim().min(1).max(800) }).strict(),
  search_appointment_availability: z.object({ patientId: patientIdSchema, specialty: z.string().trim().min(2).max(120) }).strict(),
  book_appointment: z.object({ patientId: patientIdSchema, slotId: z.string().trim().min(1), confirmed: z.literal(true) }).strict(),
  cancel_appointment: z.object({ patientId: patientIdSchema, appointmentId: z.string().trim().min(1), confirmed: z.literal(true) }).strict(),
} as const;

export type ApprovedOperation = keyof typeof approvedOperationInputs;

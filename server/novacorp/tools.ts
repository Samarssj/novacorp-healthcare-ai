import { z } from "zod";
import type { AppointmentSlot, BookingConfirmation, PolicyEvidence } from "@shared/novacorp";
import {
  bookPatientAppointment,
  cancelPatientAppointment,
  getPatientWorkspace,
  listAvailableAppointments,
  searchPatientPolicyEvidence,
} from "./careData";

const patientIdSchema = z.string().trim().min(3).max(64);

export const approvedOperationInputs = {
  get_patient_summary: z.object({ patientId: patientIdSchema }).strict(),
  search_policy_evidence: z.object({ patientId: patientIdSchema, query: z.string().trim().min(1).max(800) }).strict(),
  search_appointment_availability: z.object({ patientId: patientIdSchema, specialty: z.string().trim().min(2).max(120) }).strict(),
  book_appointment: z.object({ patientId: patientIdSchema, slotId: z.string().trim().min(1), confirmed: z.literal(true) }).strict(),
  cancel_appointment: z.object({ patientId: patientIdSchema, appointmentId: z.string().trim().min(1), confirmed: z.literal(true) }).strict(),
} as const;

export type ApprovedOperation = keyof typeof approvedOperationInputs;

export type CancellationConfirmation = Awaited<ReturnType<typeof cancelPatientAppointment>>;

/**
 * The only execution path for care operations. Every request is schema-validated
 * and carries the verified patient ID; tools cannot access another patient record.
 */
export async function executeApprovedTool(
  operation: "get_patient_summary",
  input: unknown
): Promise<Awaited<ReturnType<typeof getPatientWorkspace>>["patient"]>;
export async function executeApprovedTool(
  operation: "search_policy_evidence",
  input: unknown
): Promise<PolicyEvidence[]>;
export async function executeApprovedTool(
  operation: "search_appointment_availability",
  input: unknown
): Promise<AppointmentSlot[]>;
export async function executeApprovedTool(
  operation: "book_appointment",
  input: unknown
): Promise<BookingConfirmation>;
export async function executeApprovedTool(
  operation: "cancel_appointment",
  input: unknown
): Promise<CancellationConfirmation>;
export async function executeApprovedTool(operation: ApprovedOperation, input: unknown) {
  switch (operation) {
    case "get_patient_summary": {
      const args = approvedOperationInputs.get_patient_summary.parse(input);
      const workspace = await getPatientWorkspace(args.patientId);
      return workspace.patient;
    }
    case "search_policy_evidence": {
      const args = approvedOperationInputs.search_policy_evidence.parse(input);
      return searchPatientPolicyEvidence(args.patientId, args.query);
    }
    case "search_appointment_availability": {
      const args = approvedOperationInputs.search_appointment_availability.parse(input);
      return listAvailableAppointments(args.patientId, args.specialty);
    }
    case "book_appointment": {
      const args = approvedOperationInputs.book_appointment.parse(input);
      return bookPatientAppointment(args.patientId, args.slotId);
    }
    case "cancel_appointment": {
      const args = approvedOperationInputs.cancel_appointment.parse(input);
      return cancelPatientAppointment(args.patientId, args.appointmentId);
    }
  }
}

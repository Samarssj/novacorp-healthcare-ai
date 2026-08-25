import { z } from "zod";
import type { AppointmentSlot, BookingConfirmation, PolicyEvidence } from "@shared/novacorp";
import {
  demoWorkspace,
  findDemoSlot,
  getDemoPatient,
  searchAppointmentAvailability,
  searchPolicyEvidence,
} from "./demoData";

const patientIdSchema = z.literal("patient-demo-001");

export const approvedOperationInputs = {
  get_patient_summary: z.object({ patientId: patientIdSchema }).strict(),
  search_policy_evidence: z.object({ query: z.string().trim().min(1).max(800), plan: z.literal("NovaCorp Gold Plus") }).strict(),
  search_appointment_availability: z.object({ specialty: z.string().trim().min(2).max(120) }).strict(),
  book_appointment: z.object({ patientId: patientIdSchema, slotId: z.string().trim().min(1), confirmed: z.literal(true) }).strict(),
  cancel_appointment: z.object({ patientId: patientIdSchema, appointmentId: z.literal("appointment-demo-pcp-01"), confirmed: z.literal(true) }).strict(),
} as const;

export type ApprovedOperation = keyof typeof approvedOperationInputs;

export type CancellationConfirmation = {
  appointmentId: "appointment-demo-pcp-01";
  confirmationCode: string;
  status: "cancelled";
  clinician: string;
  specialty: string;
  dateLabel: string;
  timeLabel: string;
};

function bookAppointment(input: z.infer<typeof approvedOperationInputs.book_appointment>): BookingConfirmation {
  const slot = findDemoSlot(input.slotId);
  if (!slot) throw new Error("The requested fictional appointment slot is unavailable.");
  return { ...slot, status: "confirmed", confirmationCode: "NC-DEMO-ORTHO-8821" };
}

function cancelAppointment(_input: z.infer<typeof approvedOperationInputs.cancel_appointment>): CancellationConfirmation {
  const upcoming = demoWorkspace.patient.upcomingAppointment;
  return {
    appointmentId: "appointment-demo-pcp-01",
    confirmationCode: "NC-DEMO-CANCEL-4902",
    status: "cancelled",
    clinician: upcoming.clinician,
    specialty: upcoming.specialty,
    dateLabel: upcoming.dateLabel,
    timeLabel: upcoming.timeLabel,
  };
}

/**
 * This is the only execution path for approved NovaCorp care operations.
 * Inputs are validated before the fictional operation runs and no model-provided
 * operation name can reach an unapproved capability.
 */
export function executeApprovedTool(
  operation: "get_patient_summary",
  input: unknown
): ReturnType<typeof getDemoPatient>;
export function executeApprovedTool(
  operation: "search_policy_evidence",
  input: unknown
): PolicyEvidence[];
export function executeApprovedTool(
  operation: "search_appointment_availability",
  input: unknown
): AppointmentSlot[];
export function executeApprovedTool(
  operation: "book_appointment",
  input: unknown
): BookingConfirmation;
export function executeApprovedTool(
  operation: "cancel_appointment",
  input: unknown
): CancellationConfirmation;
export function executeApprovedTool(operation: ApprovedOperation, input: unknown) {
  switch (operation) {
    case "get_patient_summary":
      approvedOperationInputs.get_patient_summary.parse(input);
      return getDemoPatient();
    case "search_policy_evidence": {
      const args = approvedOperationInputs.search_policy_evidence.parse(input);
      return searchPolicyEvidence(args.query);
    }
    case "search_appointment_availability": {
      const args = approvedOperationInputs.search_appointment_availability.parse(input);
      return searchAppointmentAvailability(args.specialty);
    }
    case "book_appointment":
      return bookAppointment(approvedOperationInputs.book_appointment.parse(input));
    case "cancel_appointment":
      return cancelAppointment(approvedOperationInputs.cancel_appointment.parse(input));
  }
}

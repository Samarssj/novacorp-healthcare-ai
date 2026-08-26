import { and, eq } from "drizzle-orm";
import { createHash, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import {
  appointmentSlots,
  patientAllergies,
  patientAppointments,
  patientMedications,
  patients,
} from "../../drizzle/schema";
import { getDb } from "../db";
import type { AppointmentSlot, BookingConfirmation, CareWorkspace } from "@shared/novacorp";
import { searchPolicyEvidenceForPlan } from "./demoData";

export function normalizeMemberId(value: string) {
  const compact = value.trim().toUpperCase().replace(/[\s-]+/g, "");
  const match = /^([A-Z]{2,4})(\d{5,})$/.exec(compact);
  return match ? `${match[1]}-${match[2]}` : compact;
}

export function isValidMemberId(value: string) {
  return /^[A-Z]{2,4}-\d{5,}$/.test(normalizeMemberId(value));
}

export function normalizePhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (value.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new Error("Enter a valid mobile number.");
}

export function hashPhoneNumber(value: string) {
  return createHash("sha256").update(normalizePhoneNumber(value)).digest("hex");
}

function hashesMatch(left: string, right: string) {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("The care database is unavailable.");
  return db;
}

export async function verifyPatientCredentials(memberId: string, phoneNumber: string) {
  const db = await requireDb();
  const normalizedMemberId = normalizeMemberId(memberId);
  const submittedHash = hashPhoneNumber(phoneNumber);
  const matches = await db.select().from(patients).where(eq(patients.memberId, normalizedMemberId)).limit(1);
  const patient = matches[0];
  if (!patient || !hashesMatch(patient.phoneHash, submittedHash)) {
    throw new Error("We could not verify those member details.");
  }
  return patient;
}

export async function getPatientWorkspace(patientId: string): Promise<CareWorkspace> {
  const db = await requireDb();
  const patientRows = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
  const patient = patientRows[0];
  if (!patient) throw new Error("The verified patient record was not found.");

  const [medications, allergies, upcomingRows] = await Promise.all([
    db.select().from(patientMedications).where(eq(patientMedications.patientId, patientId)),
    db.select().from(patientAllergies).where(eq(patientAllergies.patientId, patientId)),
    db.select().from(patientAppointments).where(and(eq(patientAppointments.patientId, patientId), eq(patientAppointments.status, "scheduled"))).limit(1),
  ]);
  const upcoming = upcomingRows[0];

  return {
    patient: {
      id: patient.id,
      name: patient.name,
      initials: patient.initials,
      dateOfBirth: patient.dateOfBirth,
      plan: patient.plan,
      memberId: patient.memberId,
      planStatus: patient.planStatus,
      specialistCopay: patient.specialistCopay,
      deductibleRemaining: patient.deductibleRemaining,
      medications: medications.map(item => ({ name: item.name, dosage: item.dosage })),
      allergies: allergies.map(item => item.name),
      upcomingAppointment: upcoming ? {
        id: upcoming.id,
        clinician: upcoming.clinician,
        specialty: upcoming.specialty,
        dateLabel: upcoming.dateLabel,
        timeLabel: upcoming.timeLabel,
      } : undefined,
    },
    policyEvidence: [],
    appointmentSlots: [],
    initialActivity: [
      { agent: "Coordinator", action: "Care session ready", state: "complete", detail: "Verified patient session established." },
      { agent: "Patient Agent", action: "Profile ready", state: "complete", detail: "Patient-scoped profile loaded." },
      { agent: "Insurance RAG", action: "Evidence service ready", state: "complete", detail: "Policy evidence will be retrieved only when needed." },
      { agent: "Appointment Agent", action: "Scheduling service ready", state: "complete", detail: "Appointment actions require confirmation." },
    ],
  };
}

export async function searchPatientPolicyEvidence(patientId: string, query: string) {
  const workspace = await getPatientWorkspace(patientId);
  return searchPolicyEvidenceForPlan(query, workspace.patient.plan);
}

export async function listAvailableAppointments(patientId: string, specialty: string): Promise<AppointmentSlot[]> {
  await getPatientWorkspace(patientId);
  const db = await requireDb();
  const records = await db.select().from(appointmentSlots).where(and(eq(appointmentSlots.status, "available"), eq(appointmentSlots.specialty, specialty)));
  return records.map(slot => ({
    id: slot.id,
    clinician: slot.clinician,
    specialty: slot.specialty,
    dayLabel: slot.dayLabel,
    timeLabel: slot.timeLabel,
    location: slot.location,
  }));
}

export async function bookPatientAppointment(patientId: string, slotId: string): Promise<BookingConfirmation> {
  const db = await requireDb();
  const slots = await db.select().from(appointmentSlots).where(and(eq(appointmentSlots.id, slotId), eq(appointmentSlots.status, "available"))).limit(1);
  const slot = slots[0];
  if (!slot) throw new Error("That appointment slot is no longer available.");

  const appointmentId = `appointment-${nanoid(12)}`;
  const confirmationCode = `NC-${nanoid(8).toUpperCase()}`;
  await db.update(appointmentSlots).set({ status: "booked" }).where(eq(appointmentSlots.id, slotId));
  await db.insert(patientAppointments).values({
    id: appointmentId,
    patientId,
    slotId,
    clinician: slot.clinician,
    specialty: slot.specialty,
    dateLabel: slot.dayLabel,
    timeLabel: slot.timeLabel,
    location: slot.location,
    status: "scheduled",
    confirmationCode,
  });
  return { id: slot.id, clinician: slot.clinician, specialty: slot.specialty, dayLabel: slot.dayLabel, timeLabel: slot.timeLabel, location: slot.location, status: "confirmed", confirmationCode };
}

export async function cancelPatientAppointment(patientId: string, appointmentId: string) {
  const db = await requireDb();
  const appointments = await db.select().from(patientAppointments).where(and(eq(patientAppointments.id, appointmentId), eq(patientAppointments.patientId, patientId), eq(patientAppointments.status, "scheduled"))).limit(1);
  const appointment = appointments[0];
  if (!appointment) throw new Error("That appointment could not be found for this verified patient.");
  await db.update(patientAppointments).set({ status: "cancelled" }).where(eq(patientAppointments.id, appointmentId));
  if (appointment.slotId) await db.update(appointmentSlots).set({ status: "available" }).where(eq(appointmentSlots.id, appointment.slotId));
  return {
    appointmentId: appointment.id,
    confirmationCode: `NC-CANCEL-${nanoid(7).toUpperCase()}`,
    status: "cancelled" as const,
    clinician: appointment.clinician,
    specialty: appointment.specialty,
    dateLabel: appointment.dateLabel,
    timeLabel: appointment.timeLabel,
  };
}

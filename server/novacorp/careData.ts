import { createHash, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import { ReturnDocument } from "mongodb";
import { getMongoClient, getMongoDatabase } from "../mongo";
import type { AppointmentSlot, BookingConfirmation, CareWorkspace, PolicyEvidence } from "@shared/novacorp";

type PatientDocument = {
  _id: string;
  memberId: string;
  phoneHash: string;
  name: string;
  initials: string;
  dateOfBirth: string;
  plan: string;
  planStatus: "Active" | "Inactive";
  specialistCopay: string;
  deductibleRemaining: string;
  medications: Array<{ name: string; dosage: string }>;
  allergies: string[];
};

type AppointmentSlotDocument = { _id: string; clinician: string; specialty: string; dayLabel: string; timeLabel: string; location: string; status: "available" | "booked" };
type AppointmentDocument = { _id: string; patientId: string; slotId: string; clinician: string; specialty: string; dateLabel: string; timeLabel: string; location: string; status: "scheduled" | "cancelled"; confirmationCode: string; createdAt: Date };

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

function patientView(patient: PatientDocument) {
  return { id: patient._id, name: patient.name, initials: patient.initials, dateOfBirth: patient.dateOfBirth, plan: patient.plan, memberId: patient.memberId, planStatus: patient.planStatus, specialistCopay: patient.specialistCopay, deductibleRemaining: patient.deductibleRemaining, medications: patient.medications, allergies: patient.allergies };
}

function slotView(slot: AppointmentSlotDocument): AppointmentSlot {
  return { id: slot._id, clinician: slot.clinician, specialty: slot.specialty, dayLabel: slot.dayLabel, timeLabel: slot.timeLabel, location: slot.location };
}

async function requirePatient(patientId: string) {
  const db = await getMongoDatabase();
  const patient = await db.collection<PatientDocument>("patients").findOne({ _id: patientId });
  if (!patient) throw new Error("The verified patient record was not found.");
  return { db, patient };
}

export async function verifyPatientCredentials(memberId: string, phoneNumber: string) {
  const db = await getMongoDatabase();
  const normalizedMemberId = normalizeMemberId(memberId);
  const submittedHash = hashPhoneNumber(phoneNumber);
  const patient = await db.collection<PatientDocument>("patients").findOne({ memberId: normalizedMemberId });
  if (!patient || !hashesMatch(patient.phoneHash, submittedHash)) throw new Error("We could not verify those member details.");
  return patientView(patient);
}

export async function getPatientWorkspace(patientId: string): Promise<CareWorkspace> {
  const { db, patient } = await requirePatient(patientId);
  const upcoming = await db.collection<AppointmentDocument>("patientAppointments").findOne({ patientId, status: "scheduled" }, { sort: { createdAt: 1 } });
  return {
    patient: {
      ...patientView(patient),
      upcomingAppointment: upcoming ? { id: upcoming._id, clinician: upcoming.clinician, specialty: upcoming.specialty, dateLabel: upcoming.dateLabel, timeLabel: upcoming.timeLabel } : undefined,
    },
    policyEvidence: [], appointmentSlots: [],
    initialActivity: [
      { agent: "Coordinator", action: "Care session ready", state: "complete", detail: "Verified patient session established." },
      { agent: "Patient Agent", action: "Profile ready", state: "complete", detail: "MongoDB patient-scoped profile loaded." },
      { agent: "Insurance RAG", action: "Evidence service ready", state: "complete", detail: "Policy evidence will be retrieved only when needed." },
      { agent: "Appointment Agent", action: "Scheduling service ready", state: "complete", detail: "Appointment actions require confirmation." },
    ],
  };
}

export async function searchPatientPolicyEvidence(patientId: string, query: string): Promise<PolicyEvidence[]> {
  const { db, patient } = await requirePatient(patientId);
  if (patient.plan !== "NovaCorp Gold Plus" || !/knee|orthopedic|orthopaedic|specialist|consultation|surger|replacement/i.test(query)) return [];
  const ids = /replacement|surger/i.test(query) ? ["policy-joint-replacement", "policy-orthopedic-consultation"] : ["policy-orthopedic-consultation"];
  const records = await db.collection<PolicyEvidence & { _id: string }>("policyEvidence").find({ _id: { $in: ids }, plan: patient.plan }).toArray();
  return records.sort((a, b) => ids.indexOf(a._id) - ids.indexOf(b._id)).map(({ _id, id: _legacyId, ...item }) => ({ id: _id, ...item }));
}

export async function listAvailableAppointments(patientId: string, specialty: string): Promise<AppointmentSlot[]> {
  const { db } = await requirePatient(patientId);
  const slots = await db.collection<AppointmentSlotDocument>("appointmentSlots").find({ specialty, status: "available" }).toArray();
  return slots.map(slotView);
}

export async function bookPatientAppointment(patientId: string, slotId: string): Promise<BookingConfirmation> {
  const client = getMongoClient();
  await client.connect();
  const db = client.db(process.env.MONGODB_DATABASE ?? "novacorp_healthcare");
  if (!await db.collection<PatientDocument>("patients").findOne({ _id: patientId })) throw new Error("The verified patient record was not found.");
  const appointmentId = `appointment-${nanoid(12)}`;
  const confirmationCode = `NC-${nanoid(8).toUpperCase()}`;
  const now = new Date();
  const session = client.startSession();
  try {
    const slot = await session.withTransaction(async () => {
      const reserved = await db.collection<AppointmentSlotDocument>("appointmentSlots").findOneAndUpdate({ _id: slotId, status: "available" }, { $set: { status: "booked", updatedAt: now } }, { returnDocument: ReturnDocument.AFTER, session });
      if (!reserved) throw new Error("That appointment slot is no longer available.");
      await db.collection<AppointmentDocument>("patientAppointments").insertOne({ _id: appointmentId, patientId, slotId: reserved._id, clinician: reserved.clinician, specialty: reserved.specialty, dateLabel: reserved.dayLabel, timeLabel: reserved.timeLabel, location: reserved.location, status: "scheduled", confirmationCode, createdAt: now }, { session });
      return reserved;
    });
    if (!slot) throw new Error("That appointment slot is no longer available.");
    return { ...slotView(slot), status: "confirmed", confirmationCode };
  } finally {
    await session.endSession();
  }
}

export async function cancelPatientAppointment(patientId: string, appointmentId: string) {
  const client = getMongoClient();
  await client.connect();
  const db = client.db(process.env.MONGODB_DATABASE ?? "novacorp_healthcare");
  const session = client.startSession();
  try {
    const appointment = await session.withTransaction(async () => {
      const cancelled = await db.collection<AppointmentDocument>("patientAppointments").findOneAndUpdate({ _id: appointmentId, patientId, status: "scheduled" }, { $set: { status: "cancelled", updatedAt: new Date() } }, { returnDocument: ReturnDocument.BEFORE, session });
      if (!cancelled) throw new Error("That appointment could not be found for this verified patient.");
      await db.collection<AppointmentSlotDocument>("appointmentSlots").updateOne({ _id: cancelled.slotId }, { $set: { status: "available", updatedAt: new Date() } }, { session });
      return cancelled;
    });
    if (!appointment) throw new Error("That appointment could not be found for this verified patient.");
    return { appointmentId: appointment._id, confirmationCode: `NC-CANCEL-${nanoid(7).toUpperCase()}`, status: "cancelled" as const, clinician: appointment.clinician, specialty: appointment.specialty, dateLabel: appointment.dateLabel, timeLabel: appointment.timeLabel };
  } finally {
    await session.endSession();
  }
}

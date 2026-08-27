import { createHash, timingSafeEqual } from "node:crypto";
import { customAlphabet, nanoid } from "nanoid";
import { ReturnDocument } from "mongodb";
import { getMongoClient, getMongoDatabase } from "../mongo";
import type { AppointmentSlot, BookingConfirmation, CareWorkspace, LostMemberCardRequest, MemberCard, PolicyEvidence, PostalAddress } from "@shared/novacorp";

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
  address?: PostalAddress;
  memberCard?: MemberCard;
  createdAt?: Date;
  updatedAt?: Date;
};

type AppointmentSlotDocument = { _id: string; clinician: string; specialty: string; dayLabel: string; timeLabel: string; location: string; status: "available" | "booked" };
type AppointmentDocument = { _id: string; patientId: string; slotId: string; clinician: string; specialty: string; dateLabel: string; timeLabel: string; location: string; status: "scheduled" | "cancelled"; confirmationCode: string; createdAt: Date };
type LostMemberCardRequestDocument = { _id: string; patientId: string; memberId: string; status: "submitted"; submittedAt: Date; createdAt: Date };
export type MemberRegistrationInput = { name: string; dateOfBirth: string; phoneNumber: string; address: PostalAddress };
export type MemberProfileUpdateInput = MemberRegistrationInput;

const DEFAULT_ADDRESS: PostalAddress = { line1: "Not provided", city: "Not provided", state: "Not provided", postalCode: "Not provided", country: "United States" };
const createMemberNumber = customAlphabet("0123456789", 8);

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
  return { id: patient._id, name: patient.name, initials: patient.initials, dateOfBirth: patient.dateOfBirth, plan: patient.plan, memberId: patient.memberId, planStatus: patient.planStatus, specialistCopay: patient.specialistCopay, deductibleRemaining: patient.deductibleRemaining, medications: patient.medications, allergies: patient.allergies, address: patient.address ?? DEFAULT_ADDRESS, memberCard: patient.memberCard };
}

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "NM";
}

function generateMemberId() {
  return `NCM-${createMemberNumber()}`;
}

function toMemberCard(memberId: string, issuedAt: Date): MemberCard {
  return { cardNumber: `NC-${memberId.replace(/[^A-Z0-9]/g, "")}`, issuedAt: issuedAt.toISOString(), status: "active" };
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

export async function registerMember(input: MemberRegistrationInput) {
  const db = await getMongoDatabase();
  const now = new Date();
  const phoneHash = hashPhoneNumber(input.phoneNumber);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const memberId = generateMemberId();
    const patient: PatientDocument = {
      _id: `patient-${nanoid(14)}`,
      memberId,
      phoneHash,
      name: input.name.trim(),
      initials: initialsFor(input.name),
      dateOfBirth: input.dateOfBirth,
      address: input.address,
      memberCard: toMemberCard(memberId, now),
      plan: "NovaCorp Member Access",
      planStatus: "Active",
      specialistCopay: "Plan not assigned",
      deductibleRemaining: "Plan not assigned",
      medications: [],
      allergies: [],
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.collection<PatientDocument>("patients").insertOne(patient);
      return patientView(patient);
    } catch (error) {
      if ((error as { code?: number }).code !== 11000 || attempt === 7) throw error;
    }
  }
  throw new Error("A member ID could not be issued. Please try again.");
}

export async function updateMemberProfile(patientId: string, input: MemberProfileUpdateInput) {
  const db = await getMongoDatabase();
  const updated = await db.collection<PatientDocument>("patients").findOneAndUpdate(
    { _id: patientId },
    { $set: { name: input.name.trim(), initials: initialsFor(input.name), dateOfBirth: input.dateOfBirth, phoneHash: hashPhoneNumber(input.phoneNumber), address: input.address, updatedAt: new Date() } },
    { returnDocument: ReturnDocument.AFTER },
  );
  if (!updated) throw new Error("The verified patient record was not found.");
  return patientView(updated);
}

export async function getOrCreateMemberCard(patientId: string) {
  const { db, patient } = await requirePatient(patientId);
  if (patient.memberCard) return patient.memberCard;
  const memberCard = toMemberCard(patient.memberId, new Date());
  await db.collection<PatientDocument>("patients").updateOne({ _id: patientId }, { $set: { memberCard, updatedAt: new Date() } });
  return memberCard;
}

export async function requestLostMemberCard(patientId: string): Promise<LostMemberCardRequest> {
  const { db, patient } = await requirePatient(patientId);
  const existing = await db.collection<LostMemberCardRequestDocument>("memberCardRequests").findOne({ patientId, status: "submitted" });
  if (existing) return { reference: existing._id, status: existing.status, submittedAt: existing.submittedAt.toISOString() };
  await getOrCreateMemberCard(patientId);
  const submittedAt = new Date();
  const request: LostMemberCardRequestDocument = { _id: `card-request-${nanoid(12)}`, patientId, memberId: patient.memberId, status: "submitted", submittedAt, createdAt: submittedAt };
  try {
    await db.collection<LostMemberCardRequestDocument>("memberCardRequests").insertOne(request);
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const concurrent = await db.collection<LostMemberCardRequestDocument>("memberCardRequests").findOne({ patientId, status: "submitted" });
    if (!concurrent) throw error;
    return { reference: concurrent._id, status: concurrent.status, submittedAt: concurrent.submittedAt.toISOString() };
  }
  return { reference: request._id, status: request.status, submittedAt: request.submittedAt.toISOString() };
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

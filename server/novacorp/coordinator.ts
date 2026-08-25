import { z } from "zod";
import { generateGeminiStructured } from "./gemini";
import { executeApprovedTool } from "./tools";
import type {
  AgentActivity,
  AppointmentSlot,
  BookingConfirmation,
  CareWorkspace,
  CoordinatorResult,
  PolicyEvidence,
} from "@shared/novacorp";

type PatientProfile = CareWorkspace["patient"];

const specialistSchema = z.enum(["patient", "insurance", "appointment"]);
const intentSchema = z.object({
  specialists: z.array(specialistSchema).min(1).max(3),
}).strict();

const replyPlanSchema = z.object({
  includePatient: z.boolean(),
  evidenceIds: z.array(z.string()).max(2),
  includeAvailability: z.boolean(),
  appointmentAction: z.enum(["none", "offer_confirmation", "confirm_booking"]),
}).strict();

type ReplyPlan = z.infer<typeof replyPlanSchema>;
type SpecialistRoute = z.infer<typeof intentSchema>["specialists"];

export function fallbackRoute(message: string): SpecialistRoute {
  const normalized = message.toLowerCase();
  const route: SpecialistRoute = ["patient"];
  if (/cover|copay|deductible|plan|policy|benefit|eligible|replacement|consultation/.test(normalized)) route.push("insurance");
  if (/appointment|book|cancel|orthopedic|orthopaedic|cardiology|dermatology|specialist|knee/.test(normalized)) route.push("appointment");
  return route;
}

async function classifyIntent(message: string): Promise<SpecialistRoute> {
  const fallback = fallbackRoute(message);
  try {
    const result = intentSchema.parse(await generateGeminiStructured({
      schemaName: "care_specialist_route",
      schema: { type: "object", properties: { specialists: { type: "array", items: { type: "string", enum: ["patient", "insurance", "appointment"] }, minItems: 1, maxItems: 3 } }, required: ["specialists"], additionalProperties: false },
      system: "Classify the request into the minimum necessary care specialists. Valid specialists are patient, insurance, and appointment. This classification must not authenticate a user or make policy, clinical, or appointment decisions.",
      user: message,
      maxTokens: 600,
    }));
    return Array.from(new Set(["patient", ...result.specialists])) as SpecialistRoute;
  } catch {
    return fallback;
  }
}

function defaultPlan(evidence: PolicyEvidence[], slots: AppointmentSlot[], bookingConfirmed: boolean): ReplyPlan {
  return {
    includePatient: true,
    evidenceIds: evidence.map(item => item.id),
    includeAvailability: slots.length > 0,
    appointmentAction: bookingConfirmed ? "confirm_booking" : slots.length > 0 ? "offer_confirmation" : "none",
  };
}

async function selectReplyPlan(
  message: string,
  patient: PatientProfile,
  evidence: PolicyEvidence[],
  slots: AppointmentSlot[],
  bookingConfirmed: boolean
): Promise<{ plan: ReplyPlan; mode: "gemini" | "safe-fallback" }> {
  const fallback = defaultPlan(evidence, slots, bookingConfirmed);
  try {
    const candidate = replyPlanSchema.parse(await generateGeminiStructured({
      schemaName: "approved_reply_plan",
      schema: { type: "object", properties: { includePatient: { type: "boolean" }, evidenceIds: { type: "array", items: { type: "string" }, maxItems: 2 }, includeAvailability: { type: "boolean" }, appointmentAction: { type: "string", enum: ["none", "offer_confirmation", "confirm_booking"] } }, required: ["includePatient", "evidenceIds", "includeAvailability", "appointmentAction"], additionalProperties: false },
      system: "Select only server-approved response components. Do not make medical, insurance, scheduling, or coverage claims. Do not select confirm_booking unless bookingConfirmed is true.",
      user: `Request: ${message}\n\nApproved context: ${JSON.stringify({ patient, evidence: evidence.map(item => ({ id: item.id, citation: `${item.document}, ${item.section}, p. ${item.page}`, excerpt: item.excerpt })), availability: slots, bookingConfirmed })}`,
      maxTokens: 900,
    }));
    const allowedEvidence = new Set(evidence.map(item => item.id));
    return {
      plan: {
        ...candidate,
        evidenceIds: candidate.evidenceIds.filter(id => allowedEvidence.has(id)),
        includeAvailability: candidate.includeAvailability && slots.length > 0,
        appointmentAction: candidate.appointmentAction === "confirm_booking" && !bookingConfirmed ? "offer_confirmation" : candidate.appointmentAction,
      },
      mode: "gemini",
    };
  } catch {
    return { plan: fallback, mode: "safe-fallback" };
  }
}

export function buildGroundedFallback({ patient, plan, evidence, slots, booking }: { patient: PatientProfile; plan: ReplyPlan; evidence: PolicyEvidence[]; slots: AppointmentSlot[]; booking?: BookingConfirmation }) {
  const selectedEvidence = evidence.filter(item => plan.evidenceIds.includes(item.id));
  const lines = ["**NovaCorp Health care response**"];
  if (plan.includePatient) lines.push(`Your plan is **${patient.plan}** with a **${patient.specialistCopay}** specialist office-visit copay.`);
  if (selectedEvidence.length > 0) {
    lines.push("**Grounded policy evidence**");
    selectedEvidence.forEach(item => lines.push(`- ${item.excerpt} **[${item.document}, ${item.section}, p. ${item.page}]**`));
  } else {
    lines.push("I could not find retrieved NovaCorp policy evidence for that request, so I cannot make a coverage claim.");
  }
  if (booking) {
    lines.push(`**Booking confirmed:** ${booking.clinician}, ${booking.specialty}, ${booking.dayLabel} at ${booking.timeLabel}. Confirmation: **${booking.confirmationCode}**.`);
    return lines.join("\n\n");
  }
  if (plan.includeAvailability && slots[0]) lines.push(`**Earliest retrieved availability:** ${slots[0].clinician} · ${slots[0].specialty} · ${slots[0].dayLabel} at ${slots[0].timeLabel}.`);
  if (plan.appointmentAction === "offer_confirmation" && slots[0]) lines.push("No appointment has been booked. Review the displayed slot and explicitly confirm before the booking workflow can run.");
  return lines.join("\n\n");
}

const naturalReplySchema = z.object({ reply: z.string().trim().min(80).max(1600), evidenceIds: z.array(z.string()).max(2), asksForConfirmation: z.boolean() }).strict();
export type NaturalReply = z.infer<typeof naturalReplySchema>;

export function isGroundedReplyAllowed({ candidate, evidence, booking, needsConfirmation }: { candidate: NaturalReply; evidence: PolicyEvidence[]; booking?: BookingConfirmation; needsConfirmation: boolean }) {
  const approvedIds = new Set(evidence.map(item => item.id));
  const unsupportedEvidence = candidate.evidenceIds.some(id => !approvedIds.has(id));
  const hasRequiredCitations = candidate.evidenceIds.every(id => {
    const item = evidence.find(candidateEvidence => candidateEvidence.id === id);
    return item ? candidate.reply.includes(`[${item.document}, ${item.section}, p. ${item.page}]`) : false;
  });
  const declaresBookingWithoutResult = !booking && /\b(booked|booking confirmed|appointment confirmed)\b/i.test(candidate.reply);
  const makesClaimWithoutEvidence = evidence.length === 0 && /\b(cover(?:ed|age|s)?|eligible|approved)\b/i.test(candidate.reply);
  const missesConfirmationGuard = needsConfirmation && (!candidate.asksForConfirmation || !/not been booked|nothing has been booked|confirm/i.test(candidate.reply));
  const hasUnknownCitation = evidence.length === 0 && /\[.*p\.\s*\d+.*\]/i.test(candidate.reply);
  return !(unsupportedEvidence || !hasRequiredCitations || declaresBookingWithoutResult || makesClaimWithoutEvidence || missesConfirmationGuard || hasUnknownCitation);
}

async function composeNaturalLanguageReply({ message, patient, fallback, evidence, slots, booking, needsConfirmation }: { message: string; patient: PatientProfile; fallback: string; evidence: PolicyEvidence[]; slots: AppointmentSlot[]; booking?: BookingConfirmation; needsConfirmation: boolean }): Promise<{ reply: string; mode: "gemini" | "safe-fallback" }> {
  try {
    const parsed = naturalReplySchema.parse(await generateGeminiStructured({
      schemaName: "grounded_novacorp_reply",
      schema: { type: "object", properties: { reply: { type: "string" }, evidenceIds: { type: "array", items: { type: "string" }, maxItems: 2 }, asksForConfirmation: { type: "boolean" } }, required: ["reply", "evidenceIds", "asksForConfirmation"], additionalProperties: false },
      system: "Compose a concise response from only the approved patient-scoped outputs. Do not add medical advice, coverage conclusions, dates, costs, clinicians, or booking details that are absent. Preserve every citation exactly as supplied. If evidence is empty, state that no evidence was retrieved and make no coverage claim. Never say an appointment is booked unless booking is present. If confirmation is needed, clearly say that nothing has been booked and request explicit confirmation.",
      user: `Request: ${message}\n\nApproved outputs: ${JSON.stringify({ patient, evidence: evidence.map(item => ({ id: item.id, citation: `[${item.document}, ${item.section}, p. ${item.page}]`, excerpt: item.excerpt })), slots, booking, needsConfirmation })}`,
      maxTokens: 1200,
    }));
    return isGroundedReplyAllowed({ candidate: parsed, evidence, booking, needsConfirmation }) ? { reply: parsed.reply, mode: "gemini" } : { reply: fallback, mode: "safe-fallback" };
  } catch {
    return { reply: fallback, mode: "safe-fallback" };
  }
}

export type CoordinatorProgressListener = (activities: AgentActivity[]) => void;

export async function runCoordinator(input: { patientId: string; message: string; bookingConfirmed?: boolean }, onProgress?: CoordinatorProgressListener): Promise<CoordinatorResult> {
  const activities: AgentActivity[] = [
    { agent: "Coordinator", action: "Classifying request", state: "active", detail: "Gemini is selecting the required specialist agents." },
    { agent: "Patient Agent", action: "Profile queued", state: "waiting", detail: "Waiting for verified patient data." },
    { agent: "Insurance RAG", action: "Evidence queued", state: "waiting", detail: "Waiting for policy retrieval." },
    { agent: "Appointment Agent", action: "Availability queued", state: "waiting", detail: "Appointment actions remain confirmation-gated." },
    { agent: "Summary Agent", action: "Response queued", state: "waiting", detail: "Waiting for patient-scoped outputs." },
  ];
  onProgress?.([...activities]);

  const route = await classifyIntent(input.message);
  activities[0] = { agent: "Coordinator", action: "Specialists routed", state: "complete", detail: `Routed to ${route.join(", ")} specialist${route.length > 1 ? "s" : ""}.` };
  activities[1] = { ...activities[1], state: "active", action: "Retrieving profile" };
  onProgress?.([...activities]);

  const patient = await executeApprovedTool("get_patient_summary", { patientId: input.patientId });
  activities[1] = { agent: "Patient Agent", action: "Profile retrieved", state: "complete", detail: "Verified patient-scoped profile returned." };
  activities[2] = { ...activities[2], state: route.includes("insurance") ? "active" : "complete", action: route.includes("insurance") ? "Retrieving policy evidence" : "Not required" };
  onProgress?.([...activities]);

  const evidence = route.includes("insurance") ? await executeApprovedTool("search_policy_evidence", { patientId: input.patientId, query: input.message }) : [];
  activities[2] = { agent: "Insurance RAG", action: evidence.length ? "Policy evidence retrieved" : route.includes("insurance") ? "No policy evidence found" : "Not required", state: "complete", detail: evidence.length ? `${evidence.length} cited policy excerpt${evidence.length === 1 ? "" : "s"} retrieved.` : "No policy conclusion was generated without evidence." };
  activities[3] = { ...activities[3], state: route.includes("appointment") ? "active" : "complete", action: route.includes("appointment") ? "Searching availability" : "Not required" };
  onProgress?.([...activities]);

  const slots = route.includes("appointment") ? await executeApprovedTool("search_appointment_availability", { patientId: input.patientId, specialty: /cardio/i.test(input.message) ? "Cardiology" : /derm/i.test(input.message) ? "Dermatology" : "Orthopedics" }) : [];
  activities[3] = { agent: "Appointment Agent", action: slots.length ? "Availability retrieved" : route.includes("appointment") ? "No availability found" : "Not required", state: "complete", detail: slots.length ? `${slots.length} patient-eligible slot${slots.length === 1 ? "" : "s"} retrieved.` : "No appointment action was created." };
  activities[4] = { ...activities[4], state: "active", action: "Composing grounded response" };
  onProgress?.([...activities]);

  const { plan, mode: planMode } = await selectReplyPlan(input.message, patient, evidence, slots, Boolean(input.bookingConfirmed));
  const needsConfirmation = Boolean(slots[0]) && plan.appointmentAction === "offer_confirmation";
  const fallbackReply = buildGroundedFallback({ patient, plan, evidence, slots });
  const composed = await composeNaturalLanguageReply({ message: input.message, patient, fallback: fallbackReply, evidence, slots, needsConfirmation });
  activities[4] = { agent: "Summary Agent", action: "Grounded response ready", state: "complete", detail: composed.mode === "gemini" && planMode === "gemini" ? "Gemini composed from validated patient-scoped outputs." : "Safe composition used approved patient-scoped outputs only." };
  onProgress?.([...activities]);

  return { reply: composed.reply, activities, evidence, slots, needsConfirmation, bookingDraft: plan.appointmentAction === "offer_confirmation" ? slots[0] : undefined, coordinatorMode: composed.mode === "gemini" && planMode === "gemini" ? "gemini" : "safe-fallback" };
}

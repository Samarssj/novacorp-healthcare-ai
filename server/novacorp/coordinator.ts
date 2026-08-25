import { z } from "zod";
import { invokeLLM, type Tool } from "../_core/llm";
import { demoWorkspace } from "./demoData";
import { executeApprovedTool } from "./tools";
import type {
  AgentActivity,
  AppointmentSlot,
  BookingConfirmation,
  CoordinatorResult,
  PolicyEvidence,
} from "@shared/novacorp";

const GEMINI_MODEL = "gemini-3.1-pro-preview";

const replyPlanSchema = z.object({
  includePatient: z.boolean(),
  evidenceIds: z.array(z.string()).max(2),
  includeAvailability: z.boolean(),
  appointmentAction: z.enum(["none", "offer_confirmation", "confirm_booking"]),
}).strict();

type ReplyPlan = z.infer<typeof replyPlanSchema>;

const compositionTool: Tool = {
  type: "function",
  function: {
    name: "compose_grounded_reply",
    description:
      "Select which already-approved tool results should appear in a grounded patient-friendly reply. You cannot add or paraphrase facts; the server renders the final text from these approved selections.",
    parameters: {
      type: "object",
      properties: {
        includePatient: { type: "boolean" },
        evidenceIds: { type: "array", items: { type: "string" }, maxItems: 2 },
        includeAvailability: { type: "boolean" },
        appointmentAction: { type: "string", enum: ["none", "offer_confirmation", "confirm_booking"] },
      },
      required: ["includePatient", "evidenceIds", "includeAvailability", "appointmentAction"],
      additionalProperties: false,
    },
  },
};

function hasAppointmentIntent(message: string) {
  return /appointment|book|orthopedic|orthopaedic|knee|specialist/.test(message.toLowerCase());
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
  evidence: PolicyEvidence[],
  slots: AppointmentSlot[],
  bookingConfirmed: boolean
): Promise<{ plan: ReplyPlan; mode: "gemini" | "safe-fallback" }> {
  const fallback = defaultPlan(evidence, slots, bookingConfirmed);
  const approvedContext = {
    patient: executeApprovedTool("get_patient_summary", { patientId: "patient-demo-001" }),
    evidence: evidence.map(item => ({ id: item.id, citation: `${item.document}, ${item.section}, p. ${item.page}`, excerpt: item.excerpt })),
    availability: slots,
    bookingConfirmed,
  };

  try {
    const response = await invokeLLM({
      model: GEMINI_MODEL,
      max_tokens: 1024,
      tools: [compositionTool],
      toolChoice: { name: "compose_grounded_reply" },
      messages: [
        {
          role: "system",
          content:
            "You are NovaCorp Health's fictional demo coordinator. Use only the approved JSON context below. Do not make medical, insurance, scheduling, or coverage claims. Call compose_grounded_reply to select server-rendered components. Booking must be offer_confirmation unless bookingConfirmed is true.",
        },
        { role: "user", content: `Patient message: ${message}\n\nApproved context: ${JSON.stringify(approvedContext)}` },
      ],
    });

    const raw = response.choices[0]?.message.tool_calls?.[0]?.function.arguments;
    if (!raw) return { plan: fallback, mode: "safe-fallback" };
    const candidate = replyPlanSchema.parse(JSON.parse(raw));
    const allowedEvidence = new Set(evidence.map(item => item.id));
    const constrainedPlan: ReplyPlan = {
      ...candidate,
      evidenceIds: candidate.evidenceIds.filter(id => allowedEvidence.has(id)),
      includeAvailability: candidate.includeAvailability && slots.length > 0,
      appointmentAction:
        candidate.appointmentAction === "confirm_booking" && !bookingConfirmed
          ? "offer_confirmation"
          : candidate.appointmentAction,
    };
    return { plan: constrainedPlan, mode: "gemini" };
  } catch {
    return { plan: fallback, mode: "safe-fallback" };
  }
}

export function buildGroundedFallback({
  plan,
  evidence,
  slots,
  booking,
}: {
  plan: ReplyPlan;
  evidence: PolicyEvidence[];
  slots: AppointmentSlot[];
  booking?: BookingConfirmation;
}) {
  const patient = executeApprovedTool("get_patient_summary", { patientId: "patient-demo-001" });
  const selectedEvidence = evidence.filter(item => plan.evidenceIds.includes(item.id));
  const lines = ["**NovaCorp Health care response**"];

  if (plan.includePatient) {
    lines.push(`Your demo record shows **${patient.plan}** with an active status and a **${patient.specialistCopay}** specialist office-visit copay.`);
  }

  if (selectedEvidence.length > 0) {
    lines.push("**Grounded policy evidence**");
    selectedEvidence.forEach(item => {
      lines.push(`- ${item.excerpt} **[${item.document}, ${item.section}, p. ${item.page}]**`);
    });
  } else {
    lines.push("I could not find retrieved NovaCorp policy evidence for that request, so I cannot make a coverage claim.");
  }

  if (booking) {
    lines.push(`**Booking confirmed:** ${booking.clinician}, ${booking.specialty}, ${booking.dayLabel} at ${booking.timeLabel}. Confirmation: **${booking.confirmationCode}**.`);
    return lines.join("\n\n");
  }

  if (plan.includeAvailability && slots[0]) {
    const slot = slots[0];
    lines.push(`**Earliest retrieved availability:** ${slot.clinician} · ${slot.specialty} · ${slot.dayLabel} at ${slot.timeLabel}.`);
  }

  if (plan.appointmentAction === "offer_confirmation" && slots[0]) {
    lines.push("No appointment has been booked. Review the displayed slot and explicitly confirm before the booking workflow can run.");
  }

  return lines.join("\n\n");
}

const naturalReplySchema = z.object({
  reply: z.string().trim().min(80).max(1600),
  evidenceIds: z.array(z.string()).max(2),
  asksForConfirmation: z.boolean(),
}).strict();

export type NaturalReply = z.infer<typeof naturalReplySchema>;

export function isGroundedReplyAllowed({
  candidate,
  evidence,
  booking,
  needsConfirmation,
}: {
  candidate: NaturalReply;
  evidence: PolicyEvidence[];
  booking?: BookingConfirmation;
  needsConfirmation: boolean;
}) {
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

async function composeNaturalLanguageReply({
  message,
  fallback,
  evidence,
  slots,
  booking,
  needsConfirmation,
}: {
  message: string;
  fallback: string;
  evidence: PolicyEvidence[];
  slots: AppointmentSlot[];
  booking?: BookingConfirmation;
  needsConfirmation: boolean;
}): Promise<{ reply: string; mode: "gemini" | "safe-fallback" }> {
  const approved = {
    patient: executeApprovedTool("get_patient_summary", { patientId: "patient-demo-001" }),
    evidence: evidence.map(item => ({ id: item.id, citation: `[${item.document}, ${item.section}, p. ${item.page}]`, excerpt: item.excerpt })),
    slots,
    booking,
    needsConfirmation,
  };
  try {
    const response = await invokeLLM({
      model: GEMINI_MODEL,
      max_tokens: 1200,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "grounded_novacorp_reply",
          strict: true,
          schema: {
            type: "object",
            properties: {
              reply: { type: "string" },
              evidenceIds: { type: "array", items: { type: "string" }, maxItems: 2 },
              asksForConfirmation: { type: "boolean" },
            },
            required: ["reply", "evidenceIds", "asksForConfirmation"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "Compose a warm, concise response for a FICTIONAL demo. You may only use the approved tool outputs supplied by the server. Do not add medical advice, coverage conclusions, dates, costs, clinicians, or booking details that are not present. If evidence is empty, say no evidence was retrieved and make no coverage claim. Preserve every citation exactly as supplied. Never say an appointment is booked unless booking is present. If needsConfirmation is true, clearly say that nothing has been booked and request explicit confirmation.",
        },
        { role: "user", content: `User request: ${message}\n\nApproved tool outputs: ${JSON.stringify(approved)}` },
      ],
    });
    const parsed = naturalReplySchema.parse(JSON.parse(String(response.choices[0]?.message.content ?? "")));
    if (!isGroundedReplyAllowed({ candidate: parsed, evidence, booking, needsConfirmation })) {
      return { reply: fallback, mode: "safe-fallback" };
    }
    return { reply: parsed.reply, mode: "gemini" };
  } catch {
    return { reply: fallback, mode: "safe-fallback" };
  }
}

export type CoordinatorProgressListener = (activities: AgentActivity[]) => void;

export async function runCoordinator(
  input: { message: string; bookingConfirmed?: boolean },
  onProgress?: CoordinatorProgressListener
): Promise<CoordinatorResult> {
  const activities: AgentActivity[] = [
    { agent: "Coordinator", action: "Analyzing request", state: "active", detail: "Gemini is selecting approved tool operations." },
    { agent: "Patient Agent", action: "Profile queued", state: "waiting", detail: "Waiting for typed patient lookup." },
    { agent: "Insurance RAG", action: "Evidence queued", state: "waiting", detail: "Waiting for grounded policy retrieval." },
    { agent: "Appointment Agent", action: "Availability queued", state: "waiting", detail: "Booking remains confirmation-gated." },
    { agent: "Summary Agent", action: "Response queued", state: "waiting", detail: "Waiting for approved outputs." },
  ];
  onProgress?.([...activities]);

  const appointmentIntent = hasAppointmentIntent(input.message);
  executeApprovedTool("get_patient_summary", { patientId: "patient-demo-001" });
  activities[1] = { agent: "Patient Agent", action: "Profile retrieved", state: "complete", detail: "Typed fictional patient profile returned." };
  activities[2] = { ...activities[2], state: "active", action: "Retrieving policy evidence" };
  onProgress?.([...activities]);

  const evidence = executeApprovedTool("search_policy_evidence", { query: input.message, plan: "NovaCorp Gold Plus" });
  activities[2] = {
    agent: "Insurance RAG",
    action: evidence.length ? "Policy evidence retrieved" : "No policy evidence found",
    state: "complete",
    detail: evidence.length ? `${evidence.length} grounded NovaCorp excerpt${evidence.length === 1 ? "" : "s"} retrieved.` : "No matching evidence was returned; claims are withheld.",
  };
  activities[3] = { ...activities[3], state: "active", action: appointmentIntent ? "Searching availability" : "Assessing appointment request" };
  onProgress?.([...activities]);

  const slots = appointmentIntent
    ? executeApprovedTool("search_appointment_availability", { specialty: "Orthopedics" })
    : [] as AppointmentSlot[];
  activities[3] = {
    agent: "Appointment Agent",
    action: slots.length ? "Availability retrieved" : "No appointment search required",
    state: "complete",
    detail: slots.length ? `${slots.length} fictional orthopedic slot${slots.length === 1 ? "" : "s"} retrieved.` : "No appointment operation was selected.",
  };
  activities[0] = { agent: "Coordinator", action: "Approved operations selected", state: "complete", detail: "Only typed NovaCorp operations were executed." };
  activities[4] = { ...activities[4], state: "active", action: "Composing grounded response" };
  onProgress?.([...activities]);

  const { plan, mode: planMode } = await selectReplyPlan(input.message, evidence, slots, Boolean(input.bookingConfirmed));
  const needsConfirmation = Boolean(slots[0]) && plan.appointmentAction === "offer_confirmation";
  const fallbackReply = buildGroundedFallback({ plan, evidence, slots });
  const composed = await composeNaturalLanguageReply({
    message: input.message,
    fallback: fallbackReply,
    evidence,
    slots,
    needsConfirmation,
  });
  activities[4] = {
    agent: "Summary Agent",
    action: "Composing grounded response",
    state: "complete",
    detail: composed.mode === "gemini" && planMode === "gemini" ? "Gemini composed a validated response from approved outputs." : "Safe local composition used approved tool outputs only.",
  };
  onProgress?.([...activities]);

  return {
    reply: composed.reply,
    activities,
    evidence,
    slots,
    needsConfirmation,
    bookingDraft: plan.appointmentAction === "offer_confirmation" ? slots[0] : undefined,
    coordinatorMode: composed.mode === "gemini" && planMode === "gemini" ? "gemini" : "safe-fallback",
  };
}

export function confirmDemoBooking(input: { patientId: string; slotId: string; confirmed: boolean }): BookingConfirmation {
  return executeApprovedTool("book_appointment", input);
}

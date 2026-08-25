import type { Tool } from "../_core/llm";

const verifiedSession = {
  type: "string",
  description: "Resolved server-side from the verified member session; never supplied by the model or browser action payload.",
};

export const novacorpOpenApi = {
  openapi: "3.1.0",
  info: {
    title: "NovaCorp Health Care Operations",
    version: "2.0.0",
    description: "Internal, approved operations for a verified member care workspace. The server resolves patient identity from a signed session and enforces confirmation for consequential actions.",
  },
  paths: {
    "/member/verify": { post: { operationId: "verify_member", summary: "Verify member ID and mobile number, then establish a signed care session." } },
    "/patient/current": { get: { operationId: "get_patient_summary", summary: "Retrieve the verified member's patient profile." } },
    "/policy/search": { post: { operationId: "search_policy_evidence", summary: "Retrieve cited policy evidence for the verified member's plan." } },
    "/appointments/availability": { post: { operationId: "search_appointment_availability", summary: "Find available appointment slots for the verified member." } },
    "/appointments/book": { post: { operationId: "book_appointment", summary: "Book an appointment only after explicit confirmation." } },
    "/appointments/cancel": { post: { operationId: "cancel_appointment", summary: "Cancel an appointment only after explicit confirmation." } },
  },
  components: {
    schemas: {
      VerifiedSession: verifiedSession,
      MemberVerificationRequest: {
        type: "object",
        properties: { memberId: { type: "string" }, phoneNumber: { type: "string" } },
        required: ["memberId", "phoneNumber"],
        additionalProperties: false,
      },
      PolicySearchRequest: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
      AppointmentSearchRequest: {
        type: "object",
        properties: { specialty: { type: "string" } },
        required: ["specialty"],
        additionalProperties: false,
      },
      BookingRequest: {
        type: "object",
        properties: { slotId: { type: "string" }, confirmed: { type: "boolean", description: "Must be true after an explicit member confirmation." } },
        required: ["slotId", "confirmed"],
        additionalProperties: false,
      },
      CancellationRequest: {
        type: "object",
        properties: { appointmentId: { type: "string" }, confirmed: { type: "boolean", description: "Must be true after an explicit member confirmation." } },
        required: ["appointmentId", "confirmed"],
        additionalProperties: false,
      },
    },
  },
} as const;

/** Model-facing declarations intentionally omit patient identity: the server injects it from the signed session. */
export const approvedModelTools: Tool[] = [
  { type: "function", function: { name: "get_patient_summary", description: "Return the verified member's typed patient profile.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "search_policy_evidence", description: "Search approved policy excerpts for the verified member's plan and return citations. Never infer coverage without returned evidence.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } } },
  { type: "function", function: { name: "search_appointment_availability", description: "Search available appointment slots for the verified member. This operation does not book an appointment.", parameters: { type: "object", properties: { specialty: { type: "string" } }, required: ["specialty"], additionalProperties: false } } },
  { type: "function", function: { name: "book_appointment", description: "Book an appointment only when the member has clearly confirmed the displayed slot.", parameters: { type: "object", properties: { slotId: { type: "string" }, confirmed: { type: "boolean" } }, required: ["slotId", "confirmed"], additionalProperties: false } } },
  { type: "function", function: { name: "cancel_appointment", description: "Cancel an appointment only when the member has clearly confirmed the displayed appointment.", parameters: { type: "object", properties: { appointmentId: { type: "string" }, confirmed: { type: "boolean" } }, required: ["appointmentId", "confirmed"], additionalProperties: false } } },
];

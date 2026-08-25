import type { Tool } from "../_core/llm";

const patientId = {
  type: "string",
  description: "The fictional demo patient identifier.",
};

export const novacorpOpenApi = {
  openapi: "3.1.0",
  info: {
    title: "NovaCorp Health Demo Care Tools",
    version: "1.0.0",
    description:
      "Fictional demonstration contract. All operations use fictional NovaCorp Health data and may not be used for real healthcare decisions.",
  },
  paths: {
    "/patient/{patientId}": {
      get: {
        operationId: "get_patient_summary",
        summary: "Retrieve a fictional patient record.",
      },
    },
    "/policy/search": {
      post: {
        operationId: "search_policy_evidence",
        summary: "Retrieve grounded fictional NovaCorp policy evidence.",
      },
    },
    "/appointments/availability": {
      post: {
        operationId: "search_appointment_availability",
        summary: "Find fictional available appointment slots.",
      },
    },
    "/appointments/book": {
      post: {
        operationId: "book_appointment",
        summary: "Book a fictional appointment only after explicit confirmation.",
      },
    },
    "/appointments/cancel": {
      post: {
        operationId: "cancel_appointment",
        summary: "Cancel a fictional appointment only after explicit confirmation.",
      },
    },
  },
  components: {
    schemas: {
      PatientId: patientId,
      PolicySearchRequest: {
        type: "object",
        properties: { query: { type: "string" }, plan: { type: "string" } },
        required: ["query", "plan"],
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
        properties: {
          patientId,
          slotId: { type: "string" },
          confirmed: { type: "boolean", description: "Must be true after explicit user confirmation." },
        },
        required: ["patientId", "slotId", "confirmed"],
        additionalProperties: false,
      },
      CancellationRequest: {
        type: "object",
        properties: {
          patientId,
          appointmentId: { type: "string" },
          confirmed: { type: "boolean", description: "Must be true after explicit user confirmation." },
        },
        required: ["patientId", "appointmentId", "confirmed"],
        additionalProperties: false,
      },
    },
  },
} as const;

export const approvedModelTools: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_patient_summary",
      description: "Return the typed fictional NovaCorp patient profile for the current demo workspace.",
      parameters: { type: "object", properties: { patientId }, required: ["patientId"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_policy_evidence",
      description: "Search fictional NovaCorp Gold Plus policy excerpts and return citations. Never infer coverage without returned evidence.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, plan: { type: "string" } },
        required: ["query", "plan"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_appointment_availability",
      description: "Search fictional available appointment slots. This operation does not book an appointment.",
      parameters: {
        type: "object",
        properties: { specialty: { type: "string" } },
        required: ["specialty"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description: "Book a fictional appointment only when the user has clearly confirmed the displayed slot.",
      parameters: {
        type: "object",
        properties: { patientId, slotId: { type: "string" }, confirmed: { type: "boolean" } },
        required: ["patientId", "slotId", "confirmed"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description: "Cancel a fictional appointment only when the user has clearly confirmed the displayed appointment.",
      parameters: {
        type: "object",
        properties: { patientId, appointmentId: { type: "string" }, confirmed: { type: "boolean" } },
        required: ["patientId", "appointmentId", "confirmed"],
        additionalProperties: false,
      },
    },
  },
];

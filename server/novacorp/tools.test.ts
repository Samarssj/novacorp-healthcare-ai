import { describe, expect, it } from "vitest";
import { searchPolicyEvidence } from "./demoData";
import { buildGroundedFallback, isGroundedReplyAllowed } from "./coordinator";
import { approvedModelTools, novacorpOpenApi } from "./openapi";
import { executeApprovedTool } from "./tools";

describe("NovaCorp grounded tool contract", () => {
  it("returns no evidence for an unsupported policy topic", () => {
    expect(searchPolicyEvidence("Does this plan cover a fictional dermatology concierge service?")).toEqual([]);
  });

  it("returns cited NovaCorp Gold Plus evidence for an orthopedic query", () => {
    const evidence = executeApprovedTool("search_policy_evidence", {
      query: "Does my plan cover an orthopedic consultation?",
      plan: "NovaCorp Gold Plus",
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      document: "NovaCorp Gold Plus Member Handbook",
      section: "Specialist office consultations",
      page: 42,
    });
  });

  it("rejects an appointment booking without an explicit true confirmation", () => {
    expect(() => executeApprovedTool("book_appointment", {
      patientId: "patient-demo-001",
      slotId: "orthopedics-early-01",
      confirmed: false,
    })).toThrow();
  });

  it("returns booking success details only after validated confirmation", () => {
    const booking = executeApprovedTool("book_appointment", {
      patientId: "patient-demo-001",
      slotId: "orthopedics-early-01",
      confirmed: true,
    });

    expect(booking).toMatchObject({
      status: "confirmed",
      confirmationCode: "NC-DEMO-ORTHO-8821",
      clinician: "Dr. Mara Leung",
    });
  });

  it("rejects appointment cancellation without explicit confirmation", () => {
    expect(() => executeApprovedTool("cancel_appointment", {
      patientId: "patient-demo-001",
      appointmentId: "appointment-demo-pcp-01",
      confirmed: false,
    })).toThrow();
  });

  it("exposes confirmation-gated booking and cancellation in OpenAPI-derived tools", () => {
    const toolNames = approvedModelTools.map(tool => tool.function.name);

    expect(toolNames).toEqual(expect.arrayContaining(["book_appointment", "cancel_appointment"]));
    expect(novacorpOpenApi.paths).toHaveProperty("/appointments/book");
    expect(novacorpOpenApi.paths).toHaveProperty("/appointments/cancel");
  });

  it("requires citations when a coordinator response selects retrieved evidence", () => {
    const evidence = searchPolicyEvidence("Can I see an orthopedic specialist?");
    expect(isGroundedReplyAllowed({
      candidate: {
        reply: "The fictional policy excerpt supports a specialist office consultation.",
        evidenceIds: [evidence[0]!.id],
        asksForConfirmation: false,
      },
      evidence,
      needsConfirmation: false,
    })).toBe(false);

    expect(isGroundedReplyAllowed({
      candidate: {
        reply: `The fictional policy excerpt supports a specialist office consultation. [${evidence[0]!.document}, ${evidence[0]!.section}, p. ${evidence[0]!.page}]`,
        evidenceIds: [evidence[0]!.id],
        asksForConfirmation: false,
      },
      evidence,
      needsConfirmation: false,
    })).toBe(true);
  });

  it("blocks unsupported coverage language in a no-evidence response and uses a conservative fallback", () => {
    const noEvidence = [];
    expect(isGroundedReplyAllowed({
      candidate: {
        reply: "Your fictional plan covers that service.",
        evidenceIds: [],
        asksForConfirmation: false,
      },
      evidence: noEvidence,
      needsConfirmation: false,
    })).toBe(false);

    const fallback = buildGroundedFallback({
      plan: { includePatient: false, evidenceIds: [], includeAvailability: false, appointmentAction: "none" },
      evidence: noEvidence,
      slots: [],
    });
    expect(fallback).toContain("cannot make a coverage claim");
  });
});

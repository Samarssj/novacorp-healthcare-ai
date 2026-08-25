import { describe, expect, it } from "vitest";
import { getPatientWorkspace, normalizeMemberId, normalizePhoneNumber, verifyPatientCredentials } from "./careData";
import { buildGroundedFallback, fallbackRoute, isGroundedReplyAllowed } from "./coordinator";
import { searchPolicyEvidence, searchPolicyEvidenceForPlan } from "./demoData";
import { approvedModelTools, novacorpOpenApi } from "./openapi";
import { createPatientSession, resolvePatientSession } from "./session";
import { approvedOperationInputs } from "./tools";

describe("NovaCorp grounded multi-patient contract", () => {
  it("normalizes the member credentials used for deterministic verification", () => {
    expect(normalizeMemberId(" ncg-48219 ")).toBe("NCG-48219");
    expect(normalizePhoneNumber("555-010-4821")).toBe("+15550104821");
  });

  it("requires explicit confirmation in booking and cancellation tool inputs", () => {
    expect(approvedOperationInputs.book_appointment.safeParse({ patientId: "patient-avery", slotId: "slot-ortho-01", confirmed: false }).success).toBe(false);
    expect(approvedOperationInputs.cancel_appointment.safeParse({ patientId: "patient-avery", appointmentId: "appointment-avery-pcp", confirmed: false }).success).toBe(false);
  });

  it("exposes confirmation-gated booking and cancellation in OpenAPI-derived tools", () => {
    expect(approvedModelTools.map(tool => tool.function.name)).toEqual(expect.arrayContaining(["book_appointment", "cancel_appointment"]));
    expect(novacorpOpenApi.paths).toHaveProperty("/appointments/book");
    expect(novacorpOpenApi.paths).toHaveProperty("/appointments/cancel");
  });

  it("returns no insurance evidence for a plan without matching approved policy material", () => {
    expect(searchPolicyEvidenceForPlan("Does my plan cover an orthopedic consultation?", "NovaCorp Silver Select")).toEqual([]);
  });

  it("routes combined benefit and appointment questions to the required specialists", () => {
    expect(fallbackRoute("Does my plan cover knee replacement and can I book an orthopedic appointment?")).toEqual(expect.arrayContaining(["patient", "insurance", "appointment"]));
  });

  it("requires citations when a coordinator response selects retrieved evidence", () => {
    const evidence = searchPolicyEvidence("Can I see an orthopedic specialist?");
    expect(isGroundedReplyAllowed({ candidate: { reply: "The policy excerpt supports a specialist consultation.", evidenceIds: [evidence[0]!.id], asksForConfirmation: false }, evidence, needsConfirmation: false })).toBe(false);
    expect(isGroundedReplyAllowed({ candidate: { reply: `The policy excerpt supports a specialist consultation. [${evidence[0]!.document}, ${evidence[0]!.section}, p. ${evidence[0]!.page}]`, evidenceIds: [evidence[0]!.id], asksForConfirmation: false }, evidence, needsConfirmation: false })).toBe(true);
  });

  it("blocks unsupported coverage language and uses a conservative no-evidence fallback", () => {
    expect(isGroundedReplyAllowed({ candidate: { reply: "Your plan covers that service.", evidenceIds: [], asksForConfirmation: false }, evidence: [], needsConfirmation: false })).toBe(false);
    const fallback = buildGroundedFallback({ patient: { id: "patient-test", name: "Test Patient", initials: "TP", dateOfBirth: "January 1, 1990", plan: "NovaCorp Silver Select", memberId: "NCS-00001", planStatus: "Active", specialistCopay: "$0", deductibleRemaining: "$0", medications: [], allergies: [] }, plan: { includePatient: false, evidenceIds: [], includeAvailability: false, appointmentAction: "none" }, evidence: [], slots: [] });
    expect(fallback).toContain("cannot make a coverage claim");
  });
});

describe.runIf(Boolean(process.env.DATABASE_URL))("NovaCorp verified-patient database integration", () => {
  it("verifies multiple member records and isolates their workspaces", async () => {
    const [avery, maya] = await Promise.all([
      verifyPatientCredentials("NCG-48219", "555-010-4821"),
      verifyPatientCredentials("NCG-91577", "555-010-9157"),
    ]);
    expect(avery.id).toBe("patient-avery");
    expect(maya.id).toBe("patient-maya");
    const [averyWorkspace, mayaWorkspace] = await Promise.all([getPatientWorkspace(avery.id), getPatientWorkspace(maya.id)]);
    expect(averyWorkspace.patient.memberId).toBe("NCG-48219");
    expect(mayaWorkspace.patient.memberId).toBe("NCG-91577");
    expect(averyWorkspace.patient.medications).not.toEqual(mayaWorkspace.patient.medications);
  });

  it("signs a patient-scoped session that resolves only to the verified subject", async () => {
    const token = await createPatientSession("patient-maya");
    await expect(resolvePatientSession(token)).resolves.toBe("patient-maya");
  });

  it("rejects a nonmatching member and phone combination", async () => {
    await expect(verifyPatientCredentials("NCG-48219", "555-010-9157")).rejects.toThrow("could not verify");
  });
});

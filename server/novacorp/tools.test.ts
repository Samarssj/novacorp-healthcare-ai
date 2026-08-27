import { describe, expect, it } from "vitest";
import { approvedModelTools, novacorpOpenApi } from "./openapi";
import { approvedOperationInputs } from "./tools";

describe("NovaCorp Node edge contracts", () => {
  it("accepts only explicit confirmation payloads before forwarding appointments to Python", () => {
    expect(approvedOperationInputs.book_appointment.safeParse({ patientId: "patient-avery", slotId: "slot-ortho-01", confirmed: false }).success).toBe(false);
    expect(approvedOperationInputs.cancel_appointment.safeParse({ patientId: "patient-avery", appointmentId: "appointment-avery-pcp", confirmed: false }).success).toBe(false);
    expect(approvedOperationInputs.book_appointment.safeParse({ patientId: "patient-avery", slotId: "slot-ortho-01", confirmed: true }).success).toBe(true);
  });

  it("exposes explicit confirmation endpoints in the OpenAPI contract without giving ADK mutation authority", () => {
    expect(approvedModelTools.map(tool => tool.function.name)).toEqual(expect.arrayContaining(["verify_member", "book_appointment", "cancel_appointment"]));
    expect(novacorpOpenApi.paths).toHaveProperty("/appointments/book");
    expect(novacorpOpenApi.paths).toHaveProperty("/appointments/cancel");
  });
});

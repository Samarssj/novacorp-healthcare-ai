import { getMongoDatabase } from "../mongo";
import { getOrCreateMemberCard, registerMember, requestLostMemberCard, updateMemberProfile, verifyPatientCredentials } from "./careData";
import { afterAll, describe, expect, it } from "vitest";

const registrationPhone = "555-019-8642";
const updatedPhone = "555-019-8643";

describe.runIf(Boolean(process.env.MONGODB_URI))("MongoDB permanent member lifecycle", () => {
  let patientId = "";

  afterAll(async () => {
    if (!patientId) return;
    const db = await getMongoDatabase();
    await db.collection("memberCardRequests").deleteMany({ patientId });
    await db.collection("patients").deleteOne({ _id: patientId });
  }, 20_000);

  it("registers a permanent member, preserves an issued card, updates the profile, and deduplicates lost-card requests", async () => {
    const registered = await registerMember({
      name: "Morgan Rivera",
      dateOfBirth: "1992-04-18",
      phoneNumber: registrationPhone,
      address: { line1: "14 Lake Street", city: "Harborview", state: "OR", postalCode: "97035", country: "United States" },
    });
    patientId = registered.id;
    expect(registered.memberId).toMatch(/^NCM-\d{8}$/);
    expect(registered.memberCard).toMatchObject({ cardNumber: `NC-${registered.memberId.replace("-", "")}`, status: "active" });

    const verifiedAtRegistration = await verifyPatientCredentials(registered.memberId, registrationPhone);
    expect(verifiedAtRegistration.id).toBe(patientId);

    const updated = await updateMemberProfile(patientId, {
      name: "Morgan Lee Rivera",
      dateOfBirth: "1992-04-18",
      phoneNumber: updatedPhone,
      address: { line1: "77 Orchard Road", line2: "Suite 4", city: "Harborview", state: "OR", postalCode: "97035", country: "United States" },
    });
    expect(updated).toMatchObject({ name: "Morgan Lee Rivera", initials: "ML", address: { line1: "77 Orchard Road", line2: "Suite 4" } });
    await expect(verifyPatientCredentials(registered.memberId, registrationPhone)).rejects.toThrow(/could not verify/i);
    expect((await verifyPatientCredentials(registered.memberId, updatedPhone)).name).toBe("Morgan Lee Rivera");

    const card = await getOrCreateMemberCard(patientId);
    expect(card).toEqual(registered.memberCard);
    const firstRequest = await requestLostMemberCard(patientId);
    const repeatedRequest = await requestLostMemberCard(patientId);
    expect(firstRequest).toMatchObject({ status: "submitted" });
    expect(repeatedRequest.reference).toBe(firstRequest.reference);

    const db = await getMongoDatabase();
    const stored = await db.collection<{ phoneHash: string; address: { line1: string } }>("patients").findOne({ _id: patientId });
    expect(stored?.phoneHash).not.toContain(updatedPhone.replace(/\D/g, ""));
    expect(stored?.address.line1).toBe("77 Orchard Road");
  }, 30_000);
});

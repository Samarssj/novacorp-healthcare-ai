import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookPatientAppointment, cancelPatientAppointment } from "./careData";
import { getMongoDatabase } from "../mongo";

const testSlotId = "slot-mongodb-transaction-test";

describe.runIf(Boolean(process.env.MONGODB_URI))("MongoDB appointment transaction boundary", () => {
  beforeAll(async () => {
    const db = await getMongoDatabase();
    await db.collection("patientAppointments").deleteMany({ slotId: testSlotId });
    await db.collection("appointmentSlots").updateOne(
      { _id: testSlotId },
      { $set: { clinician: "Dr. Test Morgan", specialty: "Dermatology", dayLabel: "Test day", timeLabel: "10:00 AM", location: "Test Clinic", status: "available", updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
  }, 20_000);

  afterAll(async () => {
    const db = await getMongoDatabase();
    await db.collection("patientAppointments").deleteMany({ slotId: testSlotId });
    await db.collection("appointmentSlots").deleteOne({ _id: testSlotId });
  }, 20_000);

  it("reserves then releases the same slot through a confirmed patient-scoped transaction", async () => {
    const confirmation = await bookPatientAppointment("patient-avery", testSlotId);
    expect(confirmation).toMatchObject({ id: testSlotId, status: "confirmed", specialty: "Dermatology" });

    const db = await getMongoDatabase();
    const created = await db.collection<{ _id: string }>("patientAppointments").findOne({ patientId: "patient-avery", slotId: testSlotId, status: "scheduled" });
    expect(created?._id).toBeTruthy();
    const cancellation = await cancelPatientAppointment("patient-avery", created!._id);
    expect(cancellation).toMatchObject({ status: "cancelled", specialty: "Dermatology" });
  }, 30_000);
});

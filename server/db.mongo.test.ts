import { afterAll, describe, expect, it } from "vitest";
import { getUserByOpenId, upsertUser } from "./db";
import { getMongoDatabase } from "./mongo";

const testOpenId = "mongo-auth-sync-regression";

describe.runIf(Boolean(process.env.MONGODB_URI))("MongoDB OAuth user persistence", () => {
  afterAll(async () => {
    const db = await getMongoDatabase();
    await db.collection("users").deleteOne({ _id: testOpenId });
  }, 20_000);

  it("creates the first OAuth user record and preserves its profile on a later sign-in update", async () => {
    await upsertUser({ openId: testOpenId, name: "Mongo Test User", email: "mongo-test@example.invalid", loginMethod: "google" });
    await upsertUser({ openId: testOpenId, lastSignedIn: new Date() });
    await expect(getUserByOpenId(testOpenId)).resolves.toMatchObject({ id: testOpenId, name: "Mongo Test User", email: "mongo-test@example.invalid", loginMethod: "google" });
  }, 30_000);
});

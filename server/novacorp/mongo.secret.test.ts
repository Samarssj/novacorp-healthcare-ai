import { MongoClient } from "mongodb";
import { describe, expect, it } from "vitest";

describe("MONGODB_URI", () => {
  it.skipIf(!process.env.MONGODB_URI)("connects to the configured MongoDB deployment", async () => {
    const client = new MongoClient(process.env.MONGODB_URI!);
    try {
      await client.connect();
      const response = await client.db("admin").command({ ping: 1 });
      expect(response.ok).toBe(1);
    } finally {
      await client.close();
    }
  }, 20_000);
});

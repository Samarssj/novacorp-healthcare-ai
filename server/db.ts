import type { InsertUser, User } from "@shared/models";
import { getMongoDatabase } from "./mongo";
import { ENV } from "./_core/env";

type UserDocument = Omit<User, "id"> & { _id: string };

function toUser(document: UserDocument): User {
  const { _id, ...user } = document;
  return { id: _id, ...user };
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required to persist the MongoDB user record.");
  const db = await getMongoDatabase();
  const now = new Date();
  const set: Partial<UserDocument> = { updatedAt: now };
  const setOnInsert: Partial<Omit<UserDocument, "_id">> = {
    openId: user.openId,
    name: null,
    email: null,
    loginMethod: null,
    role: user.openId === ENV.ownerOpenId ? "admin" : "user",
    createdAt: now,
    lastSignedIn: now,
  };
  if (user.name !== undefined) { set.name = user.name; delete setOnInsert.name; }
  if (user.email !== undefined) { set.email = user.email; delete setOnInsert.email; }
  if (user.loginMethod !== undefined) { set.loginMethod = user.loginMethod; delete setOnInsert.loginMethod; }
  if (user.lastSignedIn !== undefined) { set.lastSignedIn = user.lastSignedIn; delete setOnInsert.lastSignedIn; }
  if (user.role !== undefined) { set.role = user.role; delete setOnInsert.role; }
  await db.collection<UserDocument>("users").updateOne(
    { _id: user.openId },
    {
      $set: set,
      $setOnInsert: setOnInsert,
    },
    { upsert: true },
  );
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getMongoDatabase();
  const document = await db.collection<UserDocument>("users").findOne({ _id: openId });
  return document ? toUser(document) : undefined;
}

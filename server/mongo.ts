import { MongoClient } from "mongodb";

let client: MongoClient | undefined;

export function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required for the NovaCorp data service.");
  if (!client) client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8_000 });
  return client;
}

export async function getMongoDatabase() {
  const connectedClient = getMongoClient();
  await connectedClient.connect();
  return connectedClient.db(process.env.MONGODB_DATABASE ?? "novacorp_healthcare");
}

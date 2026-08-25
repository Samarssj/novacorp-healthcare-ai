import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Patient records used by the verified multi-patient care workspace. */
export const patients = mysqlTable("patients", {
  id: varchar("id", { length: 64 }).primaryKey(),
  memberId: varchar("memberId", { length: 64 }).notNull().unique(),
  phoneHash: varchar("phoneHash", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  initials: varchar("initials", { length: 8 }).notNull(),
  dateOfBirth: varchar("dateOfBirth", { length: 32 }).notNull(),
  plan: varchar("plan", { length: 160 }).notNull(),
  planStatus: mysqlEnum("planStatus", ["Active", "Inactive"]).notNull().default("Active"),
  specialistCopay: varchar("specialistCopay", { length: 32 }).notNull(),
  deductibleRemaining: varchar("deductibleRemaining", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const patientMedications = mysqlTable("patientMedications", {
  id: int("id").autoincrement().primaryKey(),
  patientId: varchar("patientId", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  dosage: varchar("dosage", { length: 160 }).notNull(),
});

export const patientAllergies = mysqlTable("patientAllergies", {
  id: int("id").autoincrement().primaryKey(),
  patientId: varchar("patientId", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
});

export const appointmentSlots = mysqlTable("appointmentSlots", {
  id: varchar("id", { length: 64 }).primaryKey(),
  clinician: varchar("clinician", { length: 160 }).notNull(),
  specialty: varchar("specialty", { length: 120 }).notNull(),
  dayLabel: varchar("dayLabel", { length: 80 }).notNull(),
  timeLabel: varchar("timeLabel", { length: 80 }).notNull(),
  location: varchar("location", { length: 220 }).notNull(),
  status: mysqlEnum("status", ["available", "booked"]).notNull().default("available"),
});

export const patientAppointments = mysqlTable("patientAppointments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  patientId: varchar("patientId", { length: 64 }).notNull(),
  slotId: varchar("slotId", { length: 64 }).notNull(),
  clinician: varchar("clinician", { length: 160 }).notNull(),
  specialty: varchar("specialty", { length: 120 }).notNull(),
  dateLabel: varchar("dateLabel", { length: 80 }).notNull(),
  timeLabel: varchar("timeLabel", { length: 80 }).notNull(),
  location: varchar("location", { length: 220 }).notNull(),
  status: mysqlEnum("status", ["scheduled", "cancelled"]).notNull().default("scheduled"),
  confirmationCode: varchar("confirmationCode", { length: 80 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;
export type PatientMedication = typeof patientMedications.$inferSelect;
export type PatientAllergy = typeof patientAllergies.$inferSelect;
export type AppointmentSlotRecord = typeof appointmentSlots.$inferSelect;
export type PatientAppointment = typeof patientAppointments.$inferSelect;

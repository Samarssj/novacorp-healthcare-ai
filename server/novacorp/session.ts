import { jwtVerify, SignJWT } from "jose";
import { ENV } from "../_core/env";

export const PATIENT_SESSION_COOKIE = "novacorp_patient_session";

function sessionKey() {
  if (!ENV.cookieSecret) throw new Error("The patient-session signing secret is not configured.");
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createPatientSession(patientId: string) {
  return new SignJWT({ scope: "patient-care" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(patientId)
    .setIssuer("novacorp-health")
    .setAudience("care-workspace")
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(sessionKey());
}

export async function resolvePatientSession(token: string) {
  const { payload } = await jwtVerify(token, sessionKey(), {
    issuer: "novacorp-health",
    audience: "care-workspace",
  });
  if (!payload.sub || payload.scope !== "patient-care") throw new Error("The patient session is invalid.");
  return payload.sub;
}

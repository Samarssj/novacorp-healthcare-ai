# NovaCorp Health Care Workspace

NovaCorp Health is a responsive, patient-scoped care workspace for member benefit questions, policy evidence, appointment coordination, and validated Gemini assistance. It combines a protected member access flow, a persistent multi-patient database, typed server operations, specialist-agent routing, and confirmation-gated appointment changes.

## Member workflow

The member starts on the access screen, enters a member ID and mobile number, and receives a signed, HTTP-only care-session cookie only after the server validates both values. The browser does not select a patient ID; every subsequent workspace, chat, evidence, booking, and cancellation operation resolves the patient only from that verified session.

| Step | Server responsibility | Result |
|---|---|---|
| Verify | Normalize member ID and phone number, then compare the stored phone hash. | A 30-minute signed patient session or a generic verification error. |
| Load workspace | Resolve the session subject and query only that patient’s records. | Profile, medications, allergies, plan, and upcoming appointment. |
| Route request | Classify the question into the minimum required specialists. | Patient, Insurance, Appointment, and Summary stages. |
| Retrieve | Execute only typed, allowlisted operations with the verified patient ID injected server-side. | Patient-scoped profile, cited policy evidence, or availability. |
| Compose | Supply only approved outputs to Gemini, then validate Gemini’s structured reply. | A grounded response or conservative local fallback. |
| Act | Require an explicit second confirmation for booking or cancellation. | A validated confirmation result only after server-side checks. |

## Specialist-agent design

The coordinator is the policy boundary. Gemini may classify intent and compose a response from server-approved results, but it does not authenticate members, choose a patient, access a database, or execute an appointment action. The coordinator injects the verified patient identity and routes only to the selected specialist responsibilities.

| Specialist | Approved role |
|---|---|
| Patient Agent | Retrieves the verified member’s profile, medications, allergies, plan, and current appointment. |
| Insurance RAG Agent | Searches approved policy evidence for the verified member’s plan and returns citations. |
| Appointment Agent | Finds matching availability and carries out confirmation-gated booking or cancellation. |
| Summary Agent | Uses Gemini to compose from approved outputs; the server enforces citations, no-evidence handling, and action safeguards. |

## Gemini configuration

`server/novacorp/gemini.ts` uses the direct Google Gemini API when `GEMINI_API_KEY` is available, making it compatible with Render and other external hosts. It defaults to `gemini-3.6-flash` and accepts a `GEMINI_MODEL` override. The key is server-only and must never be passed to the client. When a platform model proxy is available locally but an external key is absent, the adapter can use the platform proxy as a fallback.

## Database and showcase members

The Drizzle schema creates tables for patients, medications, allergies, appointment slots, and patient appointments. Run the seed command once after migrating to create the local showcase members.

```bash
pnpm drizzle-kit generate
# Apply the generated migration through the configured database migration flow.
pnpm seed:demo
```

| Member | Member ID | Mobile number |
|---|---|---|
| Avery Carter | `NCG-48219` | `555-010-4821` |
| Maya Singh | `NCG-91577` | `555-010-9157` |
| Jordan Brooks | `NCS-76064` | `555-010-7606` |

## Local development

```bash
pnpm install
pnpm dev
pnpm test
pnpm check
```

The required server environment values are `DATABASE_URL`, `JWT_SECRET`, and `GEMINI_API_KEY`. A `GEMINI_MODEL` override is optional. Do not commit `.env` files or expose any of these values in client-side code.

## Render deployment

The repository includes `render.yaml` for a single stateless Node web service. Render should use `pnpm render-build` as the build command, `pnpm start` as the start command, and `/health` as the health-check path. Configure a persistent MySQL-compatible database and the server-only environment variables in Render before deploying. See [the deployment guide](docs/deployment.md) for exact setup details and official Gemini API references.

## OpenAPI and safety checks

The OpenAPI 3.1 contract lives in `server/novacorp/openapi.ts`. Its model tool definitions intentionally omit patient identifiers because the server resolves identity from the signed session. The test suite checks credential normalization, multi-patient verification, workspace isolation, signed-session subjects, specialist routing, citation requirements, no-evidence response safety, confirmation schemas, OpenAPI operation exposure, and the external Gemini credential/structured output path.

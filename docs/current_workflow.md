# NovaCorp Health Member-Care Workflow

## Verified patient access

NovaCorp Health opens with a member-access screen rather than a preselected patient profile. The server validates a normalized member ID and mobile number against the persisted patient record, then creates a short-lived signed session cookie. Every care operation resolves its patient identity from this session; no patient identifier is trusted from the browser or model.

> Gemini is a reasoning and response-composition component. Authentication, authorization, patient selection, database access, and appointment execution are server-owned responsibilities.

## Request orchestration

| Stage | Workflow | Guardrail |
|---|---|---|
| 1 | A verified member opens their profile workspace. | All database reads include the session-derived patient ID. |
| 2 | The member asks a care question. | The chat stream requires a valid session cookie. |
| 3 | Gemini classifies the request for Patient, Insurance, and/or Appointment specialists. | The server validates classification JSON and falls back to deterministic routing. |
| 4 | The coordinator calls typed approved operations for the verified member. | Every input uses Zod validation and no operation accepts model-provided patient identity. |
| 5 | Gemini composes a structured response from the approved outputs. | The server rejects unknown citations, unsupported coverage language, unconfirmed booking claims, and missing confirmation messages. |
| 6 | The interface offers an action only when a valid slot or appointment exists. | Booking and cancellation each require a separate explicit confirmation plus typed server validation. |

## Persistence model

The database stores three member profiles with per-patient plan records, medications, allergies, scheduled appointments, and available slots. The data-access layer returns only the verified subject’s workspace. The external host remains stateless because session identity is carried in a signed cookie and persistent records live in the configured database.

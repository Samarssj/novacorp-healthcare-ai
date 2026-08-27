## Verified patient access

NovaCorp starts with Nova requesting a member ID and then the associated mobile number. The deterministic server controller normalizes both values, compares the mobile hash against the MongoDB patient document, and creates a short-lived signed session only after success. Every care operation resolves its patient identity from that session; neither the browser nor the ADK model supplies it.

> Google ADK coordinates approved, read-only care callbacks. Authentication, authorization, patient selection, and appointment submission remain server-owned responsibilities.

## Request orchestration

| Stage | Workflow | Guardrail |
|---|---|---|
| 1 | A verified member opens their MongoDB-backed workspace. | Workspace reads use only the session-derived patient ID. |
| 2 | The member asks a care question. | The stream requires a valid signed patient session. |
| 3 | Node passes the trusted patient ID and question to Python Google ADK. | ADK sessions are request-scoped and do not authorize access. |
| 4 | Python ADK invokes profile, evidence, and availability callbacks. | Callback hooks allow only approved, read-only MongoDB operations. |
| 5 | The response is grounded or falls back to deterministic MongoDB callback output. | Missing evidence produces no coverage conclusion; ungrounded output is rejected. |
| 6 | The interface offers appointment review where availability exists. | Booking and cancellation require a separate, explicit confirmed request and a MongoDB transaction. |

## Persistence model

MongoDB embeds medications and allergies in each patient document and keeps appointment slots, appointments, and policy evidence in dedicated collections. Unique member-ID, slot, and scoped appointment indexes protect data integrity. The host remains stateless because signed cookies carry temporary verified-session identity while durable records reside in MongoDB.

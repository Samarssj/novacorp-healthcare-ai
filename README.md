# NovaCorp Health — Fictional Care Workspace

NovaCorp Health is a responsive patient-care dashboard that demonstrates **grounded AI coordination** within a strictly fictional environment. It combines an editorial patient workspace, Gemini-driven natural-language assistance, typed server procedures, retrieved policy evidence, and confirmation-gated appointment actions. No information in this application represents a real patient, benefit, clinician, insurer, appointment, or medical recommendation.

> **Fictional demo-data notice:** NovaCorp Health, NovaCorp Gold Plus, Avery Carter, all policy excerpts, medications, allergies, clinicians, appointment slots, copays, and outcomes are invented for demonstration. Do not use this project for medical, insurance, or real scheduling decisions.

## Experience and safeguards

The dashboard provides a patient summary, policy-evidence panel, live agent timeline, suggested prompts, and grounded chat. It presents an explicit no-evidence state rather than inventing a policy conclusion. Appointment availability is displayed before any booking can occur, and booking or cancellation requires a deliberate second confirmation step. A booking confirmation code is returned only after the typed server operation validates the exact fictional patient, slot, and confirmation flag.

| Layer | Implementation | Guardrail |
|---|---|---|
| Patient workspace | React, TypeScript, Tailwind CSS, and shadcn/ui components | A persistent banner identifies all content as fictional demo data. |
| Care data | Typed tRPC procedures backed by an in-memory demo adapter | Only the single fictional patient and predefined slots may be retrieved. |
| Policy retrieval | Query-matched NovaCorp Gold Plus evidence with citation metadata | Empty retrieval produces a no-claim response. |
| Coordinator | Custom server coordinator with staged activity updates | It calls only the approved operation dispatcher. |
| Language model | Gemini through the server-side model proxy | The model may select or compose from approved results, but server validation rejects unsupported output. |
| Appointment actions | Typed, confirmation-gated operations | `confirmed: true` and a valid demo ID are required server-side. |

## Architecture

The dashboard uses a custom coordinator rather than allowing the model to invoke arbitrary functions. The coordinator requests patient data, evidence, and availability through `executeApprovedTool()` in `server/novacorp/tools.ts`. Each tool has a Zod schema, a corresponding OpenAPI component schema, and a compatible model-function declaration. The model never receives a capability outside that allowlist.

```text
React dashboard
      │
      ▼
tRPC care.sendMessage
      │
      ▼
Custom coordinator ──► approved operation dispatcher ──► fictional demo adapter
      │                         │
      │                         ├── get_patient_summary
      │                         ├── search_policy_evidence
      │                         ├── search_appointment_availability
      │                         ├── book_appointment (confirmation required)
      │                         └── cancel_appointment (confirmation required)
      ▼
Gemini composition from approved outputs only
      │
      ▼
Citation and safety validation, then a grounded response
```

## Gemini integration

The server coordinator uses **`gemini-3.1-pro-preview`** as its language-model brain through the project’s server-side LLM helper. Model credentials are provided by the platform and are never sent to the browser or stored in source code. Gemini is asked to select approved response components and compose a concise response from the server-supplied patient, evidence, availability, and booking results.

The coordinator validates the returned structured response before displaying it. It rejects selected evidence without matching citations, coverage language when no evidence is available, confirmation prompts that fail to say no booking has occurred, and claims of a successful booking without a validated booking result. If Gemini is unavailable or its response fails validation, the coordinator falls back to a conservative locally rendered response that still uses approved outputs only.

## OpenAPI-derived approved operations

The OpenAPI 3.1 contract is maintained in `server/novacorp/openapi.ts` and is available to the dashboard through the typed `care.openApi` procedure. The same file exposes the compatible model-function declarations through `care.approvedTools`. Runtime argument validation occurs in `server/novacorp/tools.ts`; the coordinator routes every server operation through this dispatcher.

| Operation ID | Input requirements | Result | Consequential safeguard |
|---|---|---|---|
| `get_patient_summary` | Exact fictional patient ID | Typed patient profile | Read-only. |
| `search_policy_evidence` | Query and `NovaCorp Gold Plus` plan | Evidence with document, section, page, relevance, and excerpt | No result means no policy claim. |
| `search_appointment_availability` | Specialty | Fictional available slots | Search does not book. |
| `book_appointment` | Patient ID, slot ID, and `confirmed: true` | Validated demo booking confirmation | UI requires a second confirmation action. |
| `cancel_appointment` | Patient ID, appointment ID, and `confirmed: true` | Validated demo cancellation confirmation | UI requires a second confirmation action. |

## Fictional demo data

The current demonstration uses an in-memory, typed adapter in `server/novacorp/demoData.ts`. It contains one fictional patient profile, an active NovaCorp Gold Plus plan, two medications, two allergies, one upcoming primary-care appointment, two fictional orthopedic slots, and two policy excerpts. This keeps the app safe to preview without real protected health information or insurer data.

The adapter can later be replaced with database and RAG integrations while preserving the same typed operation layer. Any production-oriented extension must maintain the confirmation, citation, authorization, privacy, and evidence-validation boundaries already implemented here.

## Local development

Install dependencies once, then start the development server. The project uses the scaffold’s built-in server and frontend development flow.

```bash
pnpm install
pnpm dev
```

Run the automated checks before making a release checkpoint:

```bash
pnpm test
pnpm check
```

The project’s platform-provided model credentials are injected server-side. Do not create or commit a `.env` file containing credentials. If a different Gemini model is needed, first confirm that it exists in the available model catalog, then update the `GEMINI_MODEL` constant in `server/novacorp/coordinator.ts`.

## Tests

The test suite validates the crucial safety behavior: evidence retrieval and no-evidence results, typed tool arguments, rejected bookings without explicit confirmation, booking confirmations after validated inputs, rejected cancellations without explicit confirmation, OpenAPI tool exposure, citation requirements for selected evidence, and the conservative no-evidence fallback.

## Key files

| Path | Responsibility |
|---|---|
| `client/src/pages/Home.tsx` | Responsive editorial dashboard, chat, activity timeline, evidence panel, and confirmation UI. |
| `server/novacorp/coordinator.ts` | Gemini orchestration, grounding validation, local fallback, and activity results. |
| `server/novacorp/tools.ts` | Typed approved-operation dispatcher and confirmation enforcement. |
| `server/novacorp/openapi.ts` | OpenAPI 3.1 contract and compatible model-tool definitions. |
| `server/novacorp/demoData.ts` | Clearly fictional patient, policy, and appointment fixture data. |
| `server/novacorp/tools.test.ts` | Safety, grounding, and tool-contract coverage. |
| `todo.md` | Project implementation history and completion checklist. |

## Current scope

This project is a **fictional, portfolio-safe demonstration** of grounded care coordination. It is not a clinical decision-support system, benefits-administration product, scheduling system, or health-data platform. Any real-world implementation would require verified data sources, authentication and authorization design, audit logging, privacy and regulatory review, clinical safety review, and appropriate human oversight.

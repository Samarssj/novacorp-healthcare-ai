# Project TODO

- [x] Define fictional NovaCorp Health domain models for patient, insurance, medication, allergy, appointment, policy evidence, and agent activity.
- [x] Implement typed server procedures for fictional patient details, policy evidence retrieval, appointment availability, and safe appointment booking.
- [x] Add a custom grounded coordinator that routes patient, insurance, appointment, and response-summary tasks through approved operations only.
- [x] Integrate Gemini as the server-side LLM brain for natural-language intent handling and grounded response composition.
- [x] Define and document an OpenAPI contract and map approved operation schemas to Gemini-compatible function declarations.
- [x] Add approval-state validation that requires explicit user confirmation before booking or cancelling an appointment.
- [x] Create fictional NovaCorp Gold Plus policy evidence with citations, relevance information, and an explicit no-evidence state.
- [x] Build a responsive editorial-style dashboard with chat, patient summary, activity timeline, evidence panel, and prominent fictional-demo-data notice.
- [x] Add suggested prompts, live tool-status updates, loading states, error states, and booking confirmation UI.
- [x] Write automated tests for tool-argument validation, evidence-only responses, and confirmation-gated appointment booking.
- [x] Write local-setup and demo-data documentation, including Gemini configuration guidance.
- [x] Run type checks, automated tests, and visual verification; resolve all surfaced issues.
- [x] Surface coordinator, patient, evidence, and appointment progress incrementally during each chat request.
- [x] Add coordinator-level tests for citation-required evidence responses and safe no-evidence fallback behavior.
- [x] Stream actual coordinator operation progress from the server to the dashboard activity timeline.
- [x] Replace the prominent fictional-data banner with a discreet brand-level disclosure while retaining contextual notices in appointment confirmations and the footer.

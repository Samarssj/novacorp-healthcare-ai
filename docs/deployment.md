# Deployment Guide

## Render-compatible service design

The application is designed as one stateless Node web service. It reads `PORT`, serves a health response at `/health`, stores all patient data in the configured MySQL-compatible database, and signs short-lived verified-patient sessions with `JWT_SECRET`. It does not rely on local files, long-running workers, or in-memory patient records in production.

The included `render.yaml` uses `pnpm render-build` as its build command, `pnpm start` as its start command, and `/health` as its health-check path. Configure the following server-only values in the deployment environment: `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `BUILT_IN_FORGE_API_URL`, and `BUILT_IN_FORGE_API_KEY`. The Forge values are optional for external hosting because the Gemini adapter prefers `GEMINI_API_KEY` and uses the Forge proxy only as a local fallback.

## Gemini adapter

For an external host, `server/novacorp/gemini.ts` uses the Google Gemini REST `generateContent` endpoint with the API key sent only from the server. It defaults to `gemini-3.6-flash`, which can be overridden through `GEMINI_MODEL`. The adapter requests JSON responses using a response schema and validates every response again with Zod before it can influence care coordination. It never sends the API key to the browser.

The coordinator passes only verified-patient, approved tool outputs into Gemini. The server—not Gemini—verifies member credentials, resolves the session, executes allowlisted operations, and enforces booking confirmation.

## Database setup and seed data

Apply the reviewed Drizzle migration before seeding. Run `pnpm seed:demo` once against the configured database to create the three showcase member profiles, their records, and availability. The seed command is idempotent for patient records, appointment slots, and existing appointments.

| Sample member | Member ID | Mobile number |
|---|---|---|
| Avery Carter | `NCG-48219` | `555-010-4821` |
| Maya Singh | `NCG-91577` | `555-010-9157` |
| Jordan Brooks | `NCS-76064` | `555-010-7606` |

## External references

Google’s official Gemini API documentation describes `generateContent` as the REST endpoint for model responses and documents server-side API-key usage. Its function-calling guide describes the application-managed sequence of declaring functions, receiving a model proposal, executing the approved application function, and returning the result to the model. [1] [2]

[1]: https://ai.google.dev/api/generate-content "Google Gemini API: generateContent"
[2]: https://ai.google.dev/gemini-api/docs/function-calling "Google Gemini API: function calling"

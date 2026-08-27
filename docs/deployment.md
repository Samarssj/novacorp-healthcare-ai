## Render-compatible MongoDB service design

NovaCorp is a stateless Docker-based Node and Python service. React/TypeScript serves the member interface, while Node is limited to tRPC/SSE transport, input-shape validation, and signed HTTP-only cookie handling. The deterministic Python core owns member verification, registration, profile/card updates, patient workspaces, and confirmed appointment transactions. The official Python Google ADK runtime remains a separate, read-only care-orchestration layer. Persistent records live in MongoDB; neither Node nor an ADK session stores durable member identity.

The Render Blueprint uses the root Dockerfile and `/health`. The Dockerfile installs Python dependencies, runs `pnpm run build`, and starts `node dist/index.js`; the Node process listens on Render’s supplied `PORT`. Configure `MONGODB_URI`, `MONGODB_DATABASE` (optional), `JWT_SECRET`, `GEMINI_API_KEY`, `NOVACORP_ADK_MODEL`, and any required Manus OAuth variables as server-only environment values. The MongoDB URI must never be exposed through a `VITE_` variable.

## MongoDB setup and seed data

Create a MongoDB Atlas database user with only the project database privileges required by NovaCorp, allow the Render service to reach the cluster, and set `MONGODB_URI` in Render. Run `pnpm seed:demo` once against the intended non-production database. The seed creates the unique member-ID index, appointment indexes, policy-evidence index, and idempotent showcase data. It preserves an existing appointment slot’s booked status rather than reopening it.

The `patients` collection embeds a member’s medications and allergies because those details are read together in the verified workspace. `appointmentSlots`, `patientAppointments`, `policyEvidence`, and `memberCardRequests` are separate collections. `python_adk/core_service.py` owns deterministic writes and confirmed booking/cancellation transactions, so a slot state and appointment record change together. `python_adk/data_service.py` exposes only read-only methods to the ADK. MongoDB documents single-document atomicity and multi-document transaction support in its data-modeling and transactions guidance. [1] [2]

## Security boundaries

The Node edge forwards member-ID and mobile inputs to the deterministic Python core, then signs a patient-session cookie only for a returned verified patient ID. On all later procedures, Node resolves that cookie and forwards the trusted patient subject to Python; Python validates it again before reading or writing MongoDB. The Python ADK runner receives only the trusted patient ID and question text. Its callbacks can retrieve the profile, cited policy evidence, and availability, but cannot authenticate, book, cancel, diagnose, or use an untrusted patient ID. Booking and cancellation remain typed, confirmation-gated Node forwards to Python transactions.

## Render process model

`server/novacorp/pythonCore.ts` invokes `python_adk/core_service.py` per requested member-domain operation. `server/novacorp/adkRunner.ts` does the same for care orchestration. Both child processes return before the HTTP response completes; they are not detached workers, web servers, or durable in-memory session stores. The root Dockerfile copies the complete `python_adk/` directory and installs its pinned requirements, so the same request-scoped execution model works on Render without a separate Python deployment.

## Validate before release

```bash
pnpm seed:demo
pnpm test
pnpm check
pnpm build
```

### References

[1] [MongoDB Data Modeling](https://www.mongodb.com/docs/manual/data-modeling/)

[2] [MongoDB Transactions](https://www.mongodb.com/docs/manual/core/transactions/)

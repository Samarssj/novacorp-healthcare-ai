## Render-compatible MongoDB service design

NovaCorp is a stateless Docker-based Node and Python service. React/TypeScript serves the member interface, while the official Python Google ADK runtime owns care orchestration and read-only callback execution. Persistent care records live in MongoDB. The server validates signed member-session cookies and does not store member identity in the browser or in an ADK session.

The Render Blueprint uses the root Dockerfile, `pnpm render-build`, `pnpm start`, and `/health`. Configure `MONGODB_URI`, `MONGODB_DATABASE` (optional), `JWT_SECRET`, `GEMINI_API_KEY`, `NOVACORP_ADK_MODEL`, and any required Manus OAuth variables as server-only environment values. The MongoDB URI must never be exposed through a `VITE_` variable.

## MongoDB setup and seed data

Create a MongoDB Atlas database user with only the project database privileges required by NovaCorp, allow the Render service to reach the cluster, and set `MONGODB_URI` in Render. Run `pnpm seed:demo` once against the intended non-production database. The seed creates the unique member-ID index, appointment indexes, policy-evidence index, and idempotent showcase data. It preserves an existing appointment slot’s booked status rather than reopening it.

The `patients` collection embeds a member’s medications and allergies because those details are read together in the verified workspace. `appointmentSlots`, `patientAppointments`, and `policyEvidence` are separate collections. Confirmed booking and cancellation use a MongoDB transaction, so the slot state and appointment record change together. MongoDB documents single-document atomicity and multi-document transaction support in its data-modeling and transactions guidance. [1] [2]

## Security boundaries

The `verify_member` operation performs member-ID plus mobile-hash verification in the deterministic Node boundary. The Python ADK runner receives only the server-derived patient ID and question text. Its callbacks can retrieve the profile, cited policy evidence, and availability, but cannot authenticate, book, cancel, diagnose, or use an untrusted patient ID. Booking and cancellation remain typed, confirmation-gated server operations.

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

# NovaCorp Health Care Workspace

> **Private member access. Evidence-led coordination. Human-centred care.**

### Technology constellation

[![Core stack](https://skillicons.dev/icons?i=react,ts,tailwind,nodejs,express,python,mongodb,git,github&theme=dark&perline=9)](https://skillicons.dev)

[![tRPC](https://img.shields.io/badge/tRPC-Typed%20APIs-398CCB?style=for-the-badge&logo=trpc&logoColor=white)](https://trpc.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Data%20layer-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Google ADK](https://img.shields.io/badge/Google%20ADK-Python%20callbacks-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://adk.dev/)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1-6BA539?style=for-the-badge&logo=openapiinitiative&logoColor=white)](https://www.openapis.org/)
[![Render](https://img.shields.io/badge/Render-Deploy%20ready-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/)

NovaCorp Health is an enterprise-ready member-care workspace. It pairs an **AI-led access conversation** with a persistent multi-patient data model, policy-evidence retrieval, confirmation-gated appointments, and a guarded **Python Google ADK** runtime. The product is designed so that the server—not the model or browser—owns verification, patient identity, data access, and consequential actions.

## Product at a glance

| Capability | What it delivers |
|---|---|
| **Conversation-first access** | Nova greets the member, requests a member ID, then asks for the associated mobile number. |
| **Patient-scoped session** | A signed, HTTP-only session is issued only after the backend verifies both credentials. |
| **ADK care coordination** | Python Google ADK invokes patient, evidence, availability, and summary callbacks for verified requests. |
| **Grounded coverage support** | Policy answers use retrieved evidence with document, section, page, and relevance details. |
| **Action safeguards** | Booking and cancellation need a separate, explicit confirmation before server execution. |
| **Stateless deployment** | Persistent data lives in MongoDB; request-scoped Python ADK sessions never become an authorization store. |

---

## The member journey

```mermaid
sequenceDiagram
    autonumber
    participant M as Member
    participant N as Nova conversation
    participant V as verify_member tool
    participant D as Patient database
    participant S as Signed session
    participant C as Care coordinator

    M->>N: Opens private care conversation
    N->>M: Greets member and requests member ID
    M->>N: Shares member ID
    N->>M: Requests associated mobile number
    M->>N: Shares mobile number
    N->>V: Typed OpenAPI verification call
    V->>D: Validate normalized credentials
    D-->>V: Verified patient record
    V-->>S: Create 30-minute signed session
    S-->>M: Open patient-scoped workspace
    M->>C: Ask benefits or appointment question
```

> **Trust boundary:** Nova guides the conversation, but the server validates credentials and creates the session. Gemini never authenticates a member, chooses a patient, or directly executes an appointment action.

---

## System architecture

```mermaid
flowchart LR
    member[Member browser]
    web[React + TypeScript\nEditorial care workspace]
    trpc[tRPC procedures\nTyped contracts]
    sse[SSE care stream\nLive agent activity]
    access[Conversation controller\nCredential collection]
    session[Signed patient session\nHTTP-only cookie]
    bridge[TypeScript transport bridge\nVerified request only]
    router[Python Google ADK\nCoordinator + callbacks]
    tools[Approved OpenAPI tools\nZod argument validation]
    patient[Patient specialist]
    insurance[Insurance RAG specialist]
    appointment[Appointment specialist]
    gemini[Gemini 3.6 Flash\nADK model provider]
    db[(MongoDB\nPatients · plans · slots)]
    evidence[(Policy evidence index)]

    member --> web
    web --> trpc
    web --> sse
    trpc --> access
    access --> tools
    tools --> db
    access --> session
    session --> bridge
    sse --> bridge
    bridge --> router
    router --> patient
    router --> insurance
    router --> appointment
    router --> gemini
    patient --> db
    insurance --> evidence
    appointment --> db
    gemini -. approved outputs only .-> router
```

### Guardrails by design

| Boundary | Enforcement |
|---|---|
| **Identity** | The verified patient ID is resolved from the signed server session, never accepted from a model or action payload. |
| **Tool use** | Operations are allowlisted, described by OpenAPI 3.1, and validated with Zod before execution. |
| **Evidence** | A response selecting policy evidence must include matching citations; no-evidence requests produce no policy conclusion. |
| **Appointments** | A displayed slot does not create an appointment. The member must explicitly confirm before the server calls the booking operation. |
| **ADK callbacks** | Python `before_model` and `before_tool` callbacks require trusted patient state and reject non-allowlisted operations. |
| **Model output** | ADK responses are checked for citations, unsupported coverage language, diagnosis, and autonomous appointment claims before the member sees them. |

---

## Technology stack

| Layer | Technologies | Responsibility |
|---|---|---|
| **Experience** | React 19, TypeScript, Tailwind CSS, shadcn/ui | Responsive member conversation and care workspace. |
| **Application boundary** | Node.js, Express 4, tRPC 11 | Typed APIs, SSE activity events, signed-session validation, and a thin bridge to Python. |
| **Data** | MongoDB, MongoDB Node.js driver, PyMongo | Multi-patient records, medications, allergies, cited evidence, availability, and appointments. |
| **AI runtime** | Python 3, Google ADK, Gemini 3.6 Flash | ADK agent orchestration, typed Python function callbacks, and guarded response composition. |
| **Contracts** | OpenAPI 3.1, Zod | Documented operations and runtime validation. |
| **Deployment** | Docker, Render Blueprint, health endpoint, environment configuration | One stateless Node + Python service with persistent database backing. |

---

## Conversation and verification contract

Nova uses a deliberate two-step state machine. The sequence is predictable, inspectable, and easier to secure than interpreting a free-form identity statement.

```text
awaiting_member_id
        │ member ID captured
        ▼
awaiting_phone
        │ typed verify_member operation succeeds
        ▼
verified → signed session issued → workspace opens
```

The `verify_member` operation is included in the generated OpenAPI contract. It normalizes the member ID and mobile number, compares the server-side phone hash, returns a generic failure when validation does not succeed, and creates no patient session on its own. The conversation controller creates the session only after receiving a verified result.

---

## Quick start

### 1. Install and run

```bash
pnpm install
pnpm dev
```

### 2. Configure MongoDB and seed

```bash
# Configure MONGODB_URI in the server environment, then initialize indexes and showcase records.
pnpm seed:demo
```

### 3. Validate

```bash
pnpm test
pnpm check
pnpm build
```

## Showcase member credentials

| Member | Member ID | Mobile number |
|---|---|---|
| Avery Carter | `NCG-48219` | `555-010-4821` |
| Maya Singh | `NCG-91577` | `555-010-9157` |
| Jordan Brooks | `NCS-76064` | `555-010-7606` |

## Environment configuration

| Variable | Used for |
|---|---|
| `MONGODB_URI` | Server-only MongoDB or MongoDB Atlas connection URI. |
| `MONGODB_DATABASE` | Optional database name; defaults to `novacorp_healthcare`. |
| `JWT_SECRET` | Signing short-lived, verified patient sessions. |
| `GEMINI_API_KEY` | Server-only Gemini API access used by the Python ADK runtime. |
| `NOVACORP_ADK_MODEL` | Optional Python ADK Gemini model override; defaults to `gemini-3.6-flash`. |

Never commit environment values or expose them through client-side code.

## Deploy to Render

The included [`render.yaml`](render.yaml) configures a Docker-based, stateless Node + Python web service with the `/health` check. The root [`Dockerfile`](Dockerfile) installs the pinned Python ADK runtime, builds the React application, and starts the Node delivery process. Create a MongoDB Atlas deployment, configure the server-only values above, then run `pnpm seed:demo` once to create MongoDB indexes and the showcase records.

The project uses the official Python Google ADK agent runtime with function callbacks and lifecycle callbacks. [1] [2] [3]

## Project map

| Path | Purpose |
|---|---|
| `client/src/pages/Home.tsx` | Conversation-led member verification and patient workspace experience. |
| `server/novacorp/memberVerification.ts` | Verification conversation state machine and typed `verify_member` operation. |
| `server/novacorp/coordinator.ts` | Thin TypeScript transport bridge from the authenticated SSE route to Python. |
| `server/novacorp/adkRunner.ts` | Request-scoped Node-to-Python execution adapter and response-contract validation. |
| `python_adk/runner.py` | Official Python Google ADK agent, callback tools, grounded-output validation, and safe fallback. |
| `python_adk/data_service.py` | MongoDB-backed Python ADK callback data operations and index definitions. |
| `server/mongo.ts` | Server-only pooled MongoDB connection for deterministic verification and appointment confirmation. |
| `server/novacorp/tools.ts` | Patient-scoped approved operation dispatcher. |
| `server/novacorp/openapi.ts` | OpenAPI 3.1 contract and compatible model-tool definitions. |
| `docs/deployment.md` | External hosting, database, and Gemini deployment guide. |

## References

[1] [Google ADK — Python quickstart](https://adk.dev/get-started/python/)

[2] [Google ADK — function tools](https://adk.dev/tools-custom/function-tools/)

[3] [Google ADK — callbacks](https://adk.dev/callbacks/types-of-callbacks/)

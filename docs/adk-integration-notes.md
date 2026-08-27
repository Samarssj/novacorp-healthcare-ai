# Google ADK Integration Notes

## Original TypeScript runtime findings

The official Google Agent Development Kit TypeScript package is `@google/adk`. It provides `LlmAgent`, `FunctionTool`, and runner/session primitives for TypeScript agent applications. The project repository documents Node.js 20.19 or later as the runtime prerequisite, which is compatible with NovaCorp's managed Node.js environment.

ADK's Gemini quickstart configures an `LlmAgent` with `model: "gemini-flash-latest"` and `FunctionTool` instances whose parameters are Zod schemas. Its documented Gemini authentication variable is `GOOGLE_GENAI_API_KEY`. NovaCorp already receives `GEMINI_API_KEY` securely, so the server integration will map that existing server-only credential for the ADK runtime without exposing it to the browser.

## Stateless NovaCorp design

ADK sessions may hold event history and temporary state. NovaCorp will not use in-memory ADK session state for patient access control or durable conversation state because the service must remain stateless across Render instances. Each authenticated tRPC request will instantiate a short-lived ADK session with an opaque request ID and only the already verified patient ID in server-controlled context. Existing signed patient-session cookies remain the authorization boundary.

Only server-approved, patient-scoped functions will be wrapped as ADK `FunctionTool`s. Member ID/mobile verification, session creation, booking submission, and cancellation submission will remain deterministic server procedures outside agent decision-making. The ADK response will be validated against the existing grounded-response constraints before it reaches the user.

## Python ADK runtime revision

NovaCorp will use the official Python package, `google-adk`, for the agent runtime rather than the TypeScript package. The React interface will remain TypeScript, while an intentionally thin TypeScript server bridge passes each already authenticated care request to the Python runner.

The Python ADK implementation will define `Agent` instances with ordinary typed Python functions as function tools. Each tool receives ADK `ToolContext`, from which it reads a server-provided, opaque verified patient ID. A `before_tool_callback` will reject missing or malformed patient context and deny all mutation tools. A `before_model_callback` will supply only approved patient-scoped context; it will never include member credentials or a browser-provided patient identifier.

The runner will use one short-lived ADK session per server request. This avoids using in-memory ADK sessions as a durable authorization or persistence layer and retains Render-compatible statelessness. The existing signed patient cookie is still validated by the Node/tRPC boundary before the Python process is started.

The current `GEMINI_API_KEY` will be assigned to ADK's documented `GOOGLE_API_KEY` process environment variable only inside the Python subprocess. It stays server-side and is never sent to the React client.

## Sources

- https://adk.dev/get-started/typescript/
- https://github.com/google/adk-js
- https://adk.dev/sessions/session/
- https://adk.dev/get-started/python/
- https://adk.dev/callbacks/types-of-callbacks/
- https://adk.dev/tools-custom/function-tools/

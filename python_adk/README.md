# NovaCorp Python ADK Runtime

This directory contains the **server-side Google Agent Development Kit (ADK)** runtime. The React interface remains TypeScript, while `runner.py` performs care orchestration and every ADK function-tool callback in Python.

## Request boundary

1. The TypeScript tRPC/SSE boundary validates NovaCorp's signed patient-session cookie.
2. It passes the trusted patient ID and request text to `runner.py` through standard input.
3. The Python ADK runner creates a request-scoped in-memory ADK session containing only that trusted patient ID.
4. ADK callbacks retrieve the patient profile, cited plan evidence, and eligible availability from MongoDB through `data_service.py`.
5. Python validates any ADK model response before returning it to the interface; unavailable model service falls back to a grounded composition derived only from callback results.

> ADK never verifies a member, accepts a browser-supplied patient ID, books, cancels, diagnoses, or states ungrounded coverage. Authentication and consequential appointment submission remain separate deterministic server workflows.

## Validate

```bash
python3 -m unittest discover -s python_adk -p 'test_*.py'
```

The official runtime and PyMongo dependencies are pinned in [`requirements.txt`](requirements.txt). Production uses the root Dockerfile so Node can serve the React app and invoke the Python callback process. The `patients` collection is scoped through the server-derived `patient_id`; the ADK callback layer never accepts a patient identifier from the model.

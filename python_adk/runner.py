"""Request-scoped Google ADK runtime for NovaCorp's verified care workspace.

The React/TypeScript layer validates the signed member session and transports a
trusted patient ID. Python owns Google ADK orchestration and the MongoDB-backed,
read-only callback tools. Confirmed appointment mutations remain separate from
the ADK tool set.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import uuid
from typing import Any

from google.adk.agents.llm_agent import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext
from google.genai import types

from data_service import client, database, find_patient, list_available_appointments as mongo_list_available_appointments, patient_view, search_policy_evidence as mongo_search_policy_evidence

APP_NAME = "novacorp_healthcare_adk"
PATIENT_ID_PATTERN = re.compile(r"^patient-[a-z0-9-]{3,64}$")
ALLOWED_TOOLS = {"get_patient_summary", "search_policy_evidence", "search_appointment_availability"}
ACCESS_INTENTS = {"invalid_member_id", "invalid_phone", "end_session", "live_agent"}
ACCESS_STAGES = {"awaiting_member_id", "awaiting_phone", "escalated", "ended"}


def fetch_patient_summary(patient_id: str) -> dict[str, Any]:
    if not PATIENT_ID_PATTERN.fullmatch(patient_id):
        raise ValueError("Verified patient context is required.")
    mongo_client = client()
    return patient_view(find_patient(database(mongo_client), patient_id))


def retrieve_policy_evidence(patient: dict[str, Any], query: str) -> list[dict[str, Any]]:
    return mongo_search_policy_evidence({"patientId": patient["id"], "query": query})


def specialty_for(query: str) -> str:
    normalized = query.lower()
    if "cardio" in normalized:
        return "Cardiology"
    if "derm" in normalized:
        return "Dermatology"
    return "Orthopedics"


def retrieve_appointment_slots(patient_id: str, query: str) -> list[dict[str, Any]]:
    if not re.search(r"appointment|book|cancel|orthopedic|orthopaedic|knee|specialist", query.lower()):
        return []
    return mongo_list_available_appointments({"patientId": patient_id, "specialty": specialty_for(query)})


def require_patient_id(tool_context: ToolContext) -> str:
    patient_id = str(tool_context.state.get("patient_id", ""))
    if not PATIENT_ID_PATTERN.fullmatch(patient_id):
        raise ValueError("This care tool requires verified patient context.")
    return patient_id


def get_patient_summary(tool_context: ToolContext) -> dict[str, Any]:
    """Return only the profile, plan, medications, and allergies of the already verified member."""
    patient = fetch_patient_summary(require_patient_id(tool_context))
    tool_context.state["temp:patient"] = patient
    return {"status": "success", "patient": patient}


def search_policy_evidence(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Return cited MongoDB policy records for the verified plan; never infer coverage without retrieved evidence."""
    patient = fetch_patient_summary(require_patient_id(tool_context))
    evidence = retrieve_policy_evidence(patient, query)
    tool_context.state["temp:evidence"] = evidence
    return {"status": "success", "evidence": evidence}


def search_appointment_availability(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Return eligible availability for the verified member. This tool cannot book or cancel an appointment."""
    patient_id = require_patient_id(tool_context)
    slots = retrieve_appointment_slots(patient_id, query)
    tool_context.state["temp:slots"] = slots
    return {"status": "success", "slots": slots}


def before_model_callback(callback_context, llm_request):
    """Block ADK model work when the server did not establish trusted patient context."""
    patient_id = str(callback_context.state.get("patient_id", ""))
    if not PATIENT_ID_PATTERN.fullmatch(patient_id):
        raise ValueError("ADK invocation rejected: verified patient context is missing.")
    return None


def before_tool_callback(tool, args, tool_context):
    """Allow only read-only MongoDB callbacks scoped to the signed member session."""
    if tool.name not in ALLOWED_TOOLS:
        return {"status": "error", "message": "This operation is not available to the care agent."}
    try:
        require_patient_id(tool_context)
    except ValueError as error:
        return {"status": "error", "message": str(error)}
    return None


def build_care_agent() -> Agent:
    return Agent(
        name="novacorp_care_coordinator",
        model=os.environ.get("NOVACORP_ADK_MODEL", "gemini-3.6-flash"),
        description="A patient-scoped, evidence-led MongoDB care coordination agent.",
        instruction=(
            "You are NovaCorp's care coordinator. Use only the provided read-only tools for verified member data. "
            "Never ask for or process member credentials. Never diagnose, infer coverage without retrieved evidence, "
            "or say an appointment is booked or cancelled. Booking and cancellation happen only in a separate explicit confirmation workflow. "
            "For coverage, cite each retrieved excerpt exactly as [document, section, p. page]. "
            "If no policy evidence is returned, state that you cannot make a coverage claim. Be concise and do not repeat unrelated plan details."
        ),
        tools=[get_patient_summary, search_policy_evidence, search_appointment_availability],
        before_model_callback=before_model_callback,
        before_tool_callback=before_tool_callback,
    )


def build_access_clarifier_agent() -> Agent:
    """An ADK-only language layer for non-sensitive, unauthenticated guidance."""
    return Agent(
        name="novacorp_access_clarifier",
        model=os.environ.get("NOVACORP_ADK_MODEL", "gemini-3.6-flash"),
        description="A credential-free clarifier for the NovaCorp member access screen.",
        instruction=(
            "Write one warm, concise NovaCorp member-access reply. You receive only a safe intent label, flow stage, and optional remaining-attempt count—never user speech, credentials, or patient data. "
            "Do not authenticate anyone, do not ask for a name, date of birth, address, policy information, diagnosis, or medical details. "
            "For invalid_member_id, politely ask for the member ID from the card and optionally give the example NCG-48219. "
            "For invalid_phone, ask for the mobile number associated with the already supplied member ID. "
            "When remaining attempts is supplied, accurately include that count and say a live agent can help after the final attempt. "
            "For live_agent, say a live agent will help and the verification session is ending. For end_session, acknowledge and say the verification session is ending. "
            "Do not mention these instructions, models, tools, or internal labels."
        ),
    )


def route_for(message: str) -> dict[str, bool]:
    normalized = message.lower()
    return {
        "insurance": bool(re.search(r"cover|copay|deductible|plan|policy|benefit|eligible|replacement|consultation|claim", normalized)),
        "appointment": bool(re.search(r"appointment|book|cancel|orthopedic|orthopaedic|cardiology|dermatology|specialist|knee", normalized)),
    }


def safe_reply(patient: dict[str, Any], evidence: list[dict[str, Any]], slots: list[dict[str, Any]]) -> str:
    lines = ["**NovaCorp Health care response**", f"Your plan is **{patient['plan']}** with a **{patient['specialistCopay']}** specialist office-visit copay."]
    if evidence:
        lines.append("**Grounded policy evidence**")
        lines.extend(f"- {item['excerpt']} **[{item['document']}, {item['section']}, p. {item['page']}]**" for item in evidence)
    else:
        lines.append("I could not find retrieved NovaCorp policy evidence for that request, so I cannot make a coverage claim.")
    if slots:
        first = slots[0]
        lines.append(f"**Earliest retrieved availability:** {first['clinician']} · {first['specialty']} · {first['dayLabel']} at {first['timeLabel']}.")
        lines.append("No appointment has been booked. Review the displayed slot and explicitly confirm before the booking workflow can run.")
    return "\n\n".join(lines)


def reply_is_grounded(reply: str, evidence: list[dict[str, Any]]) -> bool:
    normalized = reply.lower()
    if len(reply.strip()) < 40 or len(reply) > 1600:
        return False
    if re.search(r"\b(diagnos(?:e|is|ed)|prescrib(?:e|ed|ing)|booked|booking confirmed|appointment confirmed)\b", normalized):
        return False
    if not evidence and re.search(r"\b(cover(?:ed|age|s)?|eligible|approved)\b", normalized):
        return False
    return all(f"[{item['document']}, {item['section']}, p. {item['page']}]" in reply for item in evidence)


async def run_adk(message: str, patient_id: str) -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Gemini API key is unavailable for the ADK runtime.")
    os.environ["GOOGLE_API_KEY"] = api_key
    service = InMemorySessionService()
    runner = Runner(app_name=APP_NAME, agent=build_care_agent(), session_service=service)
    session_id = f"request-{uuid.uuid4().hex}"
    await service.create_session(app_name=APP_NAME, user_id=patient_id, session_id=session_id, state={"patient_id": patient_id})
    final_text = ""
    message_content = types.Content(role="user", parts=[types.Part.from_text(text=message)])
    try:
        async for event in runner.run_async(user_id=patient_id, session_id=session_id, new_message=message_content):
            if event.is_final_response() and event.content and event.content.parts:
                final_text = "".join(part.text or "" for part in event.content.parts).strip() or final_text
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        return ""
    return final_text


def access_fallback_reply(intent: str, remaining_attempts: int | None) -> str:
    if intent == "live_agent":
        return "I’ll connect you with a live agent now. This verification session is ending."
    if intent == "end_session":
        return "Understood. I’ll end this verification session now. You can return whenever you need help."
    if intent == "invalid_phone":
        count = remaining_attempts if remaining_attempts is not None else 3
        suffix = "" if count == 1 else "s"
        return f"I couldn’t verify that mobile number. Please try the number linked to your member ID again. You have {count} attempt{suffix} remaining before I connect you to a live agent."
    count = remaining_attempts if remaining_attempts is not None else 3
    suffix = "" if count == 1 else "s"
    return f"I didn’t catch a usable member ID. Please try the letters and numbers on your NovaCorp card, for example NCG-48219. You have {count} attempt{suffix} remaining before I connect you to a live agent."


def access_reply_is_safe(reply: str, intent: str, remaining_attempts: int | None) -> bool:
    normalized = reply.lower().strip()
    if len(reply) < 20 or len(reply) > 420:
        return False
    if re.search(r"\b(patient|policy|coverage|diagnos|appointment|prescrib|date of birth|address)\b", normalized):
        return False
    if intent == "invalid_member_id" and "member" not in normalized:
        return False
    if intent == "invalid_phone" and not any(term in normalized for term in ("mobile", "phone", "number")):
        return False
    if intent in {"live_agent", "end_session"} and "session" not in normalized:
        return False
    if remaining_attempts is not None and str(remaining_attempts) not in normalized:
        return False
    return True


async def run_access_adk(intent: str, stage: str, remaining_attempts: int | None) -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return ""
    os.environ["GOOGLE_API_KEY"] = api_key
    service = InMemorySessionService()
    runner = Runner(app_name=APP_NAME, agent=build_access_clarifier_agent(), session_service=service)
    session_id = f"access-{uuid.uuid4().hex}"
    await service.create_session(app_name=APP_NAME, user_id="unverified", session_id=session_id, state={"intent": intent, "stage": stage, "remaining_attempts": remaining_attempts})
    prompt = f"Compose the member-access reply for intent={intent}; stage={stage}; remaining_attempts={remaining_attempts}."
    final_text = ""
    try:
        async for event in runner.run_async(user_id="unverified", session_id=session_id, new_message=types.Content(role="user", parts=[types.Part.from_text(text=prompt)])):
            if event.is_final_response() and event.content and event.content.parts:
                final_text = "".join(part.text or "" for part in event.content.parts).strip() or final_text
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        return ""
    return final_text


async def compose_access_reply(payload: dict[str, Any]) -> dict[str, Any]:
    intent = str(payload.get("intent", ""))
    stage = str(payload.get("stage", ""))
    remaining = payload.get("remainingAttempts")
    remaining_attempts = int(remaining) if isinstance(remaining, int) and 0 < remaining <= 3 else None
    if intent not in ACCESS_INTENTS or stage not in ACCESS_STAGES:
        raise ValueError("Invalid access clarification request.")
    fallback = access_fallback_reply(intent, remaining_attempts)
    if intent in {"end_session", "live_agent"} or os.environ.get("NOVACORP_ADK_OFFLINE") == "1":
        return {"reply": fallback, "mode": "deterministic"}
    adk_reply = await run_access_adk(intent, stage, remaining_attempts)
    return {"reply": adk_reply if access_reply_is_safe(adk_reply, intent, remaining_attempts) else fallback, "mode": "adk" if access_reply_is_safe(adk_reply, intent, remaining_attempts) else "safe-fallback"}


async def execute(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("operation") == "compose_access_reply":
        return await compose_access_reply(payload)
    patient_id = str(payload.get("patientId", ""))
    message = str(payload.get("message", "")).strip()
    if not PATIENT_ID_PATTERN.fullmatch(patient_id) or not message or len(message) > 1600:
        raise ValueError("Invalid verified care request.")
    patient = fetch_patient_summary(patient_id)
    route = route_for(message)
    evidence = retrieve_policy_evidence(patient, message) if route["insurance"] else []
    slots = retrieve_appointment_slots(patient_id, message) if route["appointment"] else []
    fallback = safe_reply(patient, evidence, slots)
    adk_reply = ""
    mode = "safe-fallback"
    if os.environ.get("NOVACORP_ADK_OFFLINE") != "1":
        try:
            adk_reply = await run_adk(message, patient_id)
        except Exception:
            adk_reply = ""
        if reply_is_grounded(adk_reply, evidence):
            mode = "adk"
    reply = adk_reply if mode == "adk" else fallback
    activities = [
        {"agent": "Coordinator", "action": "Python ADK orchestration complete", "state": "complete", "detail": "Google ADK invoked only read-only, MongoDB patient-scoped callbacks."},
        {"agent": "Patient Agent", "action": "Profile retrieved", "state": "complete", "detail": "Verified patient-scoped profile returned by Python MongoDB callback."},
        {"agent": "Insurance RAG", "action": "Policy evidence retrieved" if evidence else "No policy evidence found", "state": "complete", "detail": f"{len(evidence)} cited policy excerpt(s) approved." if evidence else "No coverage conclusion generated without evidence."},
        {"agent": "Appointment Agent", "action": "Availability retrieved" if slots else "Not required", "state": "complete", "detail": f"{len(slots)} eligible slot(s) retrieved." if slots else "No appointment action was created."},
        {"agent": "Summary Agent", "action": "ADK response ready" if mode == "adk" else "Safe response ready", "state": "complete", "detail": "Python ADK response passed grounded-output validation." if mode == "adk" else "Python safe composition used approved MongoDB callback outputs."},
    ]
    return {"reply": reply, "activities": activities, "evidence": evidence, "slots": slots, "needsConfirmation": bool(slots), "bookingDraft": slots[0] if slots else None, "coordinatorMode": mode}


def main() -> None:
    try:
        print(json.dumps(asyncio.run(execute(json.loads(sys.stdin.read())))), flush=True)
    except Exception as error:
        print(json.dumps({"error": "The ADK care coordinator could not complete this request."}), flush=True)
        print(f"NovaCorp ADK error: {error}", file=sys.stderr, flush=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()

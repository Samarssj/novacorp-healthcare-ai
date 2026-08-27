"""Deterministic Python application core for NovaCorp's MongoDB member domain.

Node owns only the web edge: tRPC shapes, HTTP-only session cookies, SSE framing,
and forwarding the already resolved signed-session subject. This module owns member
data, verification, registration, profile/card operations, and appointment
transactions. Google ADK care reasoning remains separately guarded in runner.py.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import re
import secrets
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from data_service import client, database, ensure_indexes, now

MAX_MEMBER_VERIFICATION_ATTEMPTS = 3
PATIENT_ID_PATTERN = re.compile(r"^patient-[a-z0-9-]{3,64}$")
MEMBER_ID_PATTERN = re.compile(r"^[A-Z]{2,4}-\d{5,}$")
DEFAULT_ADDRESS = {
    "line1": "Not provided",
    "city": "Not provided",
    "state": "Not provided",
    "postalCode": "Not provided",
    "country": "United States",
}


def normalize_member_id(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("Enter a valid member ID.")
    compact = re.sub(r"[\s-]+", "", value.strip().upper())
    match = re.fullmatch(r"([A-Z]{2,4})(\d{5,})", compact)
    return f"{match.group(1)}-{match.group(2)}" if match else compact


def is_valid_member_id(value: Any) -> bool:
    return bool(MEMBER_ID_PATTERN.fullmatch(normalize_member_id(value)))


def normalize_phone_number(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("Enter a valid mobile number.")
    digits = re.sub(r"\D", "", value)
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    if value.strip().startswith("+") and 8 <= len(digits) <= 15:
        return f"+{digits}"
    raise ValueError("Enter a valid mobile number.")


def hash_phone_number(value: Any) -> str:
    return hashlib.sha256(normalize_phone_number(value).encode("utf-8")).hexdigest()


def _require_string(value: Any, label: str, minimum: int, maximum: int) -> str:
    if not isinstance(value, str):
        raise ValueError(f"Enter a valid {label}.")
    normalized = value.strip()
    if not minimum <= len(normalized) <= maximum:
        raise ValueError(f"Enter a valid {label}.")
    return normalized


def validate_date_of_birth(value: Any) -> str:
    date_of_birth = _require_string(value, "date of birth", 10, 10)
    try:
        parsed = datetime.strptime(date_of_birth, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError as error:
        raise ValueError("Enter a valid date of birth.") from error
    if parsed > now():
        raise ValueError("Enter a valid date of birth.")
    return date_of_birth


def validate_address(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError("Enter a complete postal address.")
    address = {
        "line1": _require_string(value.get("line1"), "address line", 3, 120),
        "city": _require_string(value.get("city"), "city", 2, 80),
        "state": _require_string(value.get("state"), "state or region", 2, 80),
        "postalCode": _require_string(value.get("postalCode"), "postal code", 3, 16),
        "country": _require_string(value.get("country"), "country", 2, 80),
    }
    line2 = value.get("line2")
    if line2 is not None:
        address["line2"] = _require_string(line2, "address line", 0, 120)
    return address


def validate_member_profile(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": _require_string(payload.get("name"), "name", 2, 120),
        "dateOfBirth": validate_date_of_birth(payload.get("dateOfBirth")),
        "phoneHash": hash_phone_number(payload.get("phoneNumber")),
        "address": validate_address(payload.get("address")),
    }


def initials_for(name: str) -> str:
    initials = "".join(part[0] for part in name.split()[:2] if part)
    return initials.upper() or "NM"


def member_card(member_id: str, issued_at: datetime) -> dict[str, str]:
    return {
        "cardNumber": f"NC-{re.sub(r'[^A-Z0-9]', '', member_id)}",
        "issuedAt": issued_at.isoformat(),
        "status": "active",
    }


def patient_view(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": document["_id"],
        "name": document["name"],
        "initials": document.get("initials") or initials_for(document["name"]),
        "dateOfBirth": document.get("dateOfBirth", ""),
        "plan": document["plan"],
        "memberId": document["memberId"],
        "planStatus": document["planStatus"],
        "specialistCopay": document["specialistCopay"],
        "deductibleRemaining": document["deductibleRemaining"],
        "medications": document.get("medications", []),
        "allergies": document.get("allergies", []),
        "address": document.get("address") or DEFAULT_ADDRESS,
        "memberCard": document.get("memberCard"),
    }


def require_patient(db, patient_id: Any) -> dict[str, Any]:
    if not isinstance(patient_id, str) or not PATIENT_ID_PATTERN.fullmatch(patient_id):
        raise ValueError("Verified patient context is required.")
    patient = db.patients.find_one({"_id": patient_id})
    if not patient:
        raise ValueError("The verified patient record was not found.")
    return patient


def verify_member(payload: dict[str, Any]) -> dict[str, Any]:
    member_id = normalize_member_id(payload.get("memberId"))
    phone_hash = hash_phone_number(payload.get("phoneNumber"))
    patient = database(client()).patients.find_one({"memberId": member_id})
    if not patient or not hmac.compare_digest(str(patient.get("phoneHash", "")), phone_hash):
        raise ValueError("We could not verify those member details.")
    return patient_view(patient)


def register_member(payload: dict[str, Any]) -> dict[str, Any]:
    profile = validate_member_profile(payload)
    db = database(client())
    issued_at = now()
    for _ in range(8):
        member_id = f"NCM-{''.join(secrets.choice('0123456789') for _ in range(8))}"
        patient = {
            "_id": f"patient-{uuid.uuid4().hex[:14]}",
            "memberId": member_id,
            "phoneHash": profile["phoneHash"],
            "name": profile["name"],
            "initials": initials_for(profile["name"]),
            "dateOfBirth": profile["dateOfBirth"],
            "address": profile["address"],
            "memberCard": member_card(member_id, issued_at),
            "plan": "NovaCorp Member Access",
            "planStatus": "Active",
            "specialistCopay": "Plan not assigned",
            "deductibleRemaining": "Plan not assigned",
            "medications": [],
            "allergies": [],
            "createdAt": issued_at,
            "updatedAt": issued_at,
        }
        try:
            db.patients.insert_one(patient)
            return patient_view(patient)
        except DuplicateKeyError:
            continue
    raise RuntimeError("A member ID could not be issued. Please try again.")


def update_member_profile(payload: dict[str, Any]) -> dict[str, Any]:
    db = database(client())
    patient_id = payload.get("patientId")
    require_patient(db, patient_id)
    profile = validate_member_profile(payload)
    updated = db.patients.find_one_and_update(
        {"_id": patient_id},
        {"$set": {**profile, "initials": initials_for(profile["name"]), "updatedAt": now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise ValueError("The verified patient record was not found.")
    return patient_view(updated)


def get_or_create_member_card(payload: dict[str, Any]) -> dict[str, str]:
    db = database(client())
    patient = require_patient(db, payload.get("patientId"))
    if patient.get("memberCard"):
        return patient["memberCard"]
    card = member_card(patient["memberId"], now())
    db.patients.update_one({"_id": patient["_id"]}, {"$set": {"memberCard": card, "updatedAt": now()}})
    return card


def request_lost_member_card(payload: dict[str, Any]) -> dict[str, str]:
    db = database(client())
    patient = require_patient(db, payload.get("patientId"))
    existing = db.memberCardRequests.find_one({"patientId": patient["_id"], "status": "submitted"})
    if existing:
        return {"reference": existing["_id"], "status": existing["status"], "submittedAt": existing["submittedAt"].isoformat()}
    get_or_create_member_card({"patientId": patient["_id"]})
    submitted_at = now()
    request = {
        "_id": f"card-request-{uuid.uuid4().hex[:12]}",
        "patientId": patient["_id"],
        "memberId": patient["memberId"],
        "status": "submitted",
        "submittedAt": submitted_at,
        "createdAt": submitted_at,
    }
    try:
        db.memberCardRequests.insert_one(request)
        return {"reference": request["_id"], "status": request["status"], "submittedAt": submitted_at.isoformat()}
    except DuplicateKeyError:
        concurrent = db.memberCardRequests.find_one({"patientId": patient["_id"], "status": "submitted"})
        if not concurrent:
            raise
        return {"reference": concurrent["_id"], "status": concurrent["status"], "submittedAt": concurrent["submittedAt"].isoformat()}


def get_patient_workspace(payload: dict[str, Any]) -> dict[str, Any]:
    db = database(client())
    patient_id = payload.get("patientId")
    patient = patient_view(require_patient(db, patient_id))
    upcoming = db.patientAppointments.find_one({"patientId": patient_id, "status": "scheduled"}, sort=[("createdAt", 1)])
    if upcoming:
        patient["upcomingAppointment"] = {
            "id": upcoming["_id"],
            "clinician": upcoming["clinician"],
            "specialty": upcoming["specialty"],
            "dateLabel": upcoming["dateLabel"],
            "timeLabel": upcoming["timeLabel"],
        }
    return {
        "patient": patient,
        "policyEvidence": [],
        "appointmentSlots": [],
        "initialActivity": [
            {"agent": "Coordinator", "action": "Care session ready", "state": "complete", "detail": "Verified patient session established."},
            {"agent": "Patient Agent", "action": "Profile ready", "state": "complete", "detail": "Python MongoDB patient-scoped profile loaded."},
            {"agent": "Insurance RAG", "action": "Evidence service ready", "state": "complete", "detail": "Policy evidence will be retrieved only when needed."},
            {"agent": "Appointment Agent", "action": "Scheduling service ready", "state": "complete", "detail": "Appointment actions require confirmation."},
        ],
    }


def _slot_view(slot: dict[str, Any]) -> dict[str, Any]:
    return {"id": slot["_id"], "clinician": slot["clinician"], "specialty": slot["specialty"], "dayLabel": slot["dayLabel"], "timeLabel": slot["timeLabel"], "location": slot["location"]}


def book_confirmed_appointment(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("confirmed") is not True:
        raise ValueError("Appointment confirmation is required.")
    patient_id = payload.get("patientId")
    slot_id = _require_string(payload.get("slotId"), "appointment slot", 1, 120)
    mongo_client = client()
    db = database(mongo_client)
    require_patient(db, patient_id)
    appointment_id = f"appointment-{uuid.uuid4().hex[:12]}"
    confirmation_code = f"NC-{uuid.uuid4().hex[:8].upper()}"
    created_at = now()

    def reserve_slot(session):
        slot = db.appointmentSlots.find_one_and_update(
            {"_id": slot_id, "status": "available"},
            {"$set": {"status": "booked", "updatedAt": created_at}},
            return_document=ReturnDocument.AFTER,
            session=session,
        )
        if not slot:
            raise ValueError("That appointment slot is no longer available.")
        db.patientAppointments.insert_one(
            {
                "_id": appointment_id,
                "patientId": patient_id,
                "slotId": slot["_id"],
                "clinician": slot["clinician"],
                "specialty": slot["specialty"],
                "dateLabel": slot["dayLabel"],
                "timeLabel": slot["timeLabel"],
                "location": slot["location"],
                "status": "scheduled",
                "confirmationCode": confirmation_code,
                "createdAt": created_at,
                "updatedAt": created_at,
            },
            session=session,
        )
        return slot

    with mongo_client.start_session() as session:
        slot = session.with_transaction(reserve_slot)
    return {**_slot_view(slot), "status": "confirmed", "confirmationCode": confirmation_code}


def cancel_confirmed_appointment(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("confirmed") is not True:
        raise ValueError("Appointment confirmation is required.")
    patient_id = payload.get("patientId")
    appointment_id = _require_string(payload.get("appointmentId"), "appointment", 1, 120)
    mongo_client = client()
    db = database(mongo_client)
    require_patient(db, patient_id)

    def cancel_appointment(session):
        appointment = db.patientAppointments.find_one_and_update(
            {"_id": appointment_id, "patientId": patient_id, "status": "scheduled"},
            {"$set": {"status": "cancelled", "updatedAt": now()}},
            return_document=ReturnDocument.BEFORE,
            session=session,
        )
        if not appointment:
            raise ValueError("That appointment could not be found for this verified patient.")
        db.appointmentSlots.update_one({"_id": appointment["slotId"]}, {"$set": {"status": "available", "updatedAt": now()}}, session=session)
        return appointment

    with mongo_client.start_session() as session:
        appointment = session.with_transaction(cancel_appointment)
    return {
        "appointmentId": appointment["_id"],
        "confirmationCode": f"NC-CANCEL-{uuid.uuid4().hex[:7].upper()}",
        "status": "cancelled",
        "clinician": appointment["clinician"],
        "specialty": appointment["specialty"],
        "dateLabel": appointment["dateLabel"],
        "timeLabel": appointment["timeLabel"],
    }


def _normalize_message(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("Enter a message to continue.")
    normalized = re.sub(r"[^a-z0-9\s'-]", " ", value.lower())
    return re.sub(r"\s+", " ", normalized).strip()


def _requests_live_agent(message: str) -> bool:
    return bool(
        re.search(r"\b(?:connect|transfer|route|speak|talk|help|need|want|ask)\b.*\b(?:live|living|human|person|representative|agent|someone)\b", message)
        or re.search(r"\b(?:live|living|human|person|representative)\s+agent\b", message)
        or re.search(r"\bi (?:do not|don't|dont)(?: (?:speak|understand|know))? (?:english|engels)\b", message)
    )


def _requests_exit(message: str) -> bool:
    words = message.split()
    looks_like_stt_closing = "session" in words and any(re.fullmatch(r"(?:end|ended|ending|close|closed|stop|quit|leave|exit|cancel|jesse|jes|enges|enge|eng|enge[sr]?)", word) for word in words)
    short_abandoned = bool(re.fullmatch(r"i (?:do not|don't|dont)(?:\s+(?:need|want|have|know|understand|english|engels))?", message))
    explicit = bool(re.fullmatch(r"(?:i )?(?:do not|don't|dont) (?:want|need|have) (?:anything|anthing|anyting)(?: else| more)?(?: help)?|nothing(?: else)?|no thanks|(?:please )?end(?: the)? session|end|goodbye|bye|that's all|thats all|and the session", message))
    return explicit or short_abandoned or looks_like_stt_closing


def _access_fallback(intent: str, remaining_attempts: int | None = None) -> str:
    if intent == "live_agent":
        return "I’ll connect you with a live agent now. This verification session is ending."
    if intent == "end_session":
        return "Understood. I’ll end this verification session now. You can return whenever you need help."
    count = remaining_attempts if remaining_attempts is not None else MAX_MEMBER_VERIFICATION_ATTEMPTS
    suffix = "" if count == 1 else "s"
    if intent == "invalid_phone":
        return f"I couldn’t verify that mobile number for the member ID already provided. Please try the associated mobile number again. You have {count} attempt{suffix} remaining before I connect you to a live agent."
    return f"I didn’t catch a usable member ID. Please try the letters and numbers on your NovaCorp card, for example NCG-48219. You have {count} attempt{suffix} remaining before I connect you to a live agent."


def _compose_access_reply(intent: str, stage: str, remaining_attempts: int | None = None) -> str:
    fallback = _access_fallback(intent, remaining_attempts)
    if intent in {"live_agent", "end_session"}:
        return fallback
    try:
        from runner import compose_access_reply

        result = asyncio.run(compose_access_reply({"intent": intent, "stage": stage, "remainingAttempts": remaining_attempts}))
        reply = result.get("reply") if isinstance(result, dict) else None
        return reply if isinstance(reply, str) and reply.strip() else fallback
    except Exception:
        return fallback


def continue_member_conversation(payload: dict[str, Any]) -> dict[str, Any]:
    stage = payload.get("stage")
    if stage not in {"awaiting_member_id", "awaiting_phone", "verified", "escalated", "ended"}:
        raise ValueError("Invalid verification stage.")
    message = _normalize_message(payload.get("message"))
    previous_attempts = payload.get("failedAttempts", 0)
    failed_attempts = min(max(int(previous_attempts) if isinstance(previous_attempts, int) else 0, 0), MAX_MEMBER_VERIFICATION_ATTEMPTS - 1)
    if _requests_live_agent(message):
        return {"stage": "escalated", "failedAttempts": 0, "reply": _compose_access_reply("live_agent", "escalated")}
    if _requests_exit(message):
        return {"stage": "ended", "failedAttempts": 0, "reply": _compose_access_reply("end_session", "ended")}
    if stage == "awaiting_member_id":
        member_id = normalize_member_id(message)
        if not is_valid_member_id(member_id):
            next_attempts = failed_attempts + 1
            if next_attempts >= MAX_MEMBER_VERIFICATION_ATTEMPTS:
                return {"stage": "escalated", "failedAttempts": MAX_MEMBER_VERIFICATION_ATTEMPTS, "reply": _compose_access_reply("live_agent", "escalated")}
            return {"stage": "awaiting_member_id", "failedAttempts": next_attempts, "reply": _compose_access_reply("invalid_member_id", "awaiting_member_id", MAX_MEMBER_VERIFICATION_ATTEMPTS - next_attempts)}
        return {"stage": "awaiting_phone", "memberId": member_id, "failedAttempts": failed_attempts, "reply": "Thank you. Please enter the mobile number associated with that member ID."}
    if stage == "awaiting_phone":
        member_id = payload.get("memberId")
        if not isinstance(member_id, str) or not is_valid_member_id(member_id):
            raise ValueError("A member ID is required before mobile verification.")
        try:
            patient = verify_member({"memberId": member_id, "phoneNumber": payload.get("message")})
            return {
                "stage": "verified",
                "failedAttempts": 0,
                "memberId": patient["memberId"],
                "patient": {"id": patient["id"], "name": patient["name"], "memberId": patient["memberId"], "plan": patient["plan"]},
                "toolCall": "verify_member",
                "reply": f"You’re verified, {patient['name'].split()[0]}. I’m opening your private care workspace now.",
            }
        except ValueError:
            next_attempts = failed_attempts + 1
            if next_attempts >= MAX_MEMBER_VERIFICATION_ATTEMPTS:
                return {"stage": "escalated", "failedAttempts": MAX_MEMBER_VERIFICATION_ATTEMPTS, "reply": _compose_access_reply("live_agent", "escalated")}
            return {"stage": "awaiting_phone", "failedAttempts": next_attempts, "memberId": member_id, "reply": _compose_access_reply("invalid_phone", "awaiting_phone", MAX_MEMBER_VERIFICATION_ATTEMPTS - next_attempts)}
    if stage == "escalated":
        return {"stage": "escalated", "failedAttempts": MAX_MEMBER_VERIFICATION_ATTEMPTS, "reply": "Your secure verification session has ended. A live agent can help with your next steps."}
    if stage == "ended":
        return {"stage": "ended", "failedAttempts": 0, "reply": "This verification session has ended. You can return whenever you need help."}
    return {"stage": "verified", "failedAttempts": 0, "reply": "Your care workspace is already open."}


OPERATIONS: dict[str, Callable[[dict[str, Any]], Any]] = {
    "verify_member": verify_member,
    "continue_member_conversation": continue_member_conversation,
    "register_member": register_member,
    "get_patient_workspace": get_patient_workspace,
    "update_member_profile": update_member_profile,
    "get_or_create_member_card": get_or_create_member_card,
    "request_lost_member_card": request_lost_member_card,
    "book_confirmed_appointment": book_confirmed_appointment,
    "cancel_confirmed_appointment": cancel_confirmed_appointment,
}


def execute(payload: dict[str, Any]) -> Any:
    operation = payload.get("operation")
    if operation not in OPERATIONS:
        raise ValueError("This Python core operation is not approved.")
    operation_payload = payload.get("payload")
    if not isinstance(operation_payload, dict):
        raise ValueError("Invalid Python core payload.")
    return OPERATIONS[operation](operation_payload)


def main() -> None:
    try:
        print(json.dumps({"result": execute(json.loads(sys.stdin.read()))}, default=str), flush=True)
    except Exception as error:
        print(json.dumps({"error": str(error)}), flush=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()

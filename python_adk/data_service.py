"""MongoDB data operations for NovaCorp’s verified-member care workflow.

The Node process validates cookies and executes deterministic confirmations; this
module owns MongoDB reads for Python ADK callbacks and the idempotent seed path.
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any

from pymongo import MongoClient, ReturnDocument

DATABASE_NAME = os.environ.get("MONGODB_DATABASE", "novacorp_healthcare")
_mongo_client: MongoClient | None = None


def client() -> MongoClient:
    global _mongo_client
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise RuntimeError("The secure MongoDB care database is unavailable.")
    if _mongo_client is None:
        _mongo_client = MongoClient(uri, serverSelectionTimeoutMS=8_000, connectTimeoutMS=8_000)
    return _mongo_client


def database(mongo_client: MongoClient):
    return mongo_client[DATABASE_NAME]


def now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_indexes(db) -> None:
    db.patients.create_index("memberId", unique=True, name="patients_member_id_unique")
    db.patients.create_index("phoneHash", name="patients_phone_hash")
    db.appointmentSlots.create_index([("specialty", 1), ("status", 1)], name="slots_specialty_status")
    db.patientAppointments.create_index([("patientId", 1), ("status", 1)], name="appointments_patient_status")
    db.patientAppointments.create_index("slotId", unique=True, sparse=True, name="appointments_slot_unique")
    db.policyEvidence.create_index([("plan", 1), ("relevance", -1)], name="evidence_plan_relevance")


def patient_view(document: dict[str, Any]) -> dict[str, Any]:
    return {"id": document["_id"], "name": document["name"], "initials": document["initials"], "dateOfBirth": document["dateOfBirth"], "plan": document["plan"], "memberId": document["memberId"], "planStatus": document["planStatus"], "specialistCopay": document["specialistCopay"], "deductibleRemaining": document["deductibleRemaining"], "medications": document.get("medications", []), "allergies": document.get("allergies", [])}


def slot_view(document: dict[str, Any]) -> dict[str, Any]:
    return {"id": document["_id"], "clinician": document["clinician"], "specialty": document["specialty"], "dayLabel": document["dayLabel"], "timeLabel": document["timeLabel"], "location": document["location"]}


def appointment_view(document: dict[str, Any]) -> dict[str, Any]:
    return {"id": document["_id"], "clinician": document["clinician"], "specialty": document["specialty"], "dateLabel": document["dateLabel"], "timeLabel": document["timeLabel"], "location": document["location"]}


def find_patient(db, patient_id: str) -> dict[str, Any]:
    patient = db.patients.find_one({"_id": patient_id})
    if not patient:
        raise ValueError("The verified patient record was not found.")
    return patient


def verify_patient_credentials(payload: dict[str, Any]) -> dict[str, Any]:
    db = database(client())
    patient = db.patients.find_one({"memberId": payload["memberId"]})
    if not patient or patient.get("phoneHash") != payload["phoneHash"]:
        raise ValueError("We could not verify those member details.")
    return patient_view(patient)


def get_patient_workspace(payload: dict[str, Any]) -> dict[str, Any]:
    db = database(client())
    patient = patient_view(find_patient(db, payload["patientId"]))
    upcoming = db.patientAppointments.find_one({"patientId": payload["patientId"], "status": "scheduled"}, sort=[("createdAt", 1)])
    if upcoming:
        patient["upcomingAppointment"] = appointment_view(upcoming)
    return {
        "patient": patient, "policyEvidence": [], "appointmentSlots": [],
        "initialActivity": [
            {"agent": "Coordinator", "action": "Care session ready", "state": "complete", "detail": "Verified patient session established."},
            {"agent": "Patient Agent", "action": "Profile ready", "state": "complete", "detail": "MongoDB patient-scoped profile loaded."},
            {"agent": "Insurance RAG", "action": "Evidence service ready", "state": "complete", "detail": "Policy evidence will be retrieved only when needed."},
            {"agent": "Appointment Agent", "action": "Scheduling service ready", "state": "complete", "detail": "Appointment actions require confirmation."},
        ],
    }


def search_policy_evidence(payload: dict[str, Any]) -> list[dict[str, Any]]:
    query = payload["query"].lower()
    if not any(term in query for term in ("knee", "orthopedic", "orthopaedic", "specialist", "consultation", "surger", "replacement")):
        return []
    db = database(client())
    patient = find_patient(db, payload["patientId"])
    if patient["plan"] != "NovaCorp Gold Plus":
        return []
    evidence_ids = ["policy-joint-replacement", "policy-orthopedic-consultation"] if any(term in query for term in ("replacement", "surger")) else ["policy-orthopedic-consultation"]
    records = list(db.policyEvidence.find({"_id": {"$in": evidence_ids}, "plan": patient["plan"]}))
    records.sort(key=lambda item: evidence_ids.index(item["_id"]))
    return [{"id": item["_id"], "document": item["document"], "section": item["section"], "page": item["page"], "plan": item["plan"], "relevance": item["relevance"], "excerpt": item["excerpt"]} for item in records]


def list_available_appointments(payload: dict[str, Any]) -> list[dict[str, Any]]:
    db = database(client())
    find_patient(db, payload["patientId"])
    return [slot_view(item) for item in db.appointmentSlots.find({"specialty": payload["specialty"], "status": "available"})]


def book_patient_appointment(payload: dict[str, Any]) -> dict[str, Any]:
    mongo_client = client()
    db = database(mongo_client)
    find_patient(db, payload["patientId"])
    confirmation_code = f"NC-{uuid.uuid4().hex[:8].upper()}"
    appointment_id = f"appointment-{uuid.uuid4().hex[:12]}"

    def reserve_slot(session):
        slot = db.appointmentSlots.find_one_and_update({"_id": payload["slotId"], "status": "available"}, {"$set": {"status": "booked", "updatedAt": now()}}, return_document=ReturnDocument.AFTER, session=session)
        if not slot:
            raise ValueError("That appointment slot is no longer available.")
        db.patientAppointments.insert_one({"_id": appointment_id, "patientId": payload["patientId"], "slotId": slot["_id"], "clinician": slot["clinician"], "specialty": slot["specialty"], "dateLabel": slot["dayLabel"], "timeLabel": slot["timeLabel"], "location": slot["location"], "status": "scheduled", "confirmationCode": confirmation_code, "createdAt": now(), "updatedAt": now()}, session=session)
        return slot

    with mongo_client.start_session() as session:
        slot = session.with_transaction(reserve_slot)
    return {**slot_view(slot), "status": "confirmed", "confirmationCode": confirmation_code}


def cancel_patient_appointment(payload: dict[str, Any]) -> dict[str, Any]:
    mongo_client = client()
    db = database(mongo_client)

    def cancel_appointment(session):
        appointment = db.patientAppointments.find_one_and_update({"_id": payload["appointmentId"], "patientId": payload["patientId"], "status": "scheduled"}, {"$set": {"status": "cancelled", "updatedAt": now()}}, return_document=ReturnDocument.BEFORE, session=session)
        if not appointment:
            raise ValueError("That appointment could not be found for this verified patient.")
        db.appointmentSlots.update_one({"_id": appointment["slotId"]}, {"$set": {"status": "available", "updatedAt": now()}}, session=session)
        return appointment

    with mongo_client.start_session() as session:
        appointment = session.with_transaction(cancel_appointment)
    return {"appointmentId": appointment["_id"], "confirmationCode": f"NC-CANCEL-{uuid.uuid4().hex[:7].upper()}", "status": "cancelled", "clinician": appointment["clinician"], "specialty": appointment["specialty"], "dateLabel": appointment["dateLabel"], "timeLabel": appointment["timeLabel"]}


OPERATIONS = {"verify_patient_credentials": verify_patient_credentials, "get_patient_workspace": get_patient_workspace, "search_policy_evidence": search_policy_evidence, "list_available_appointments": list_available_appointments, "book_patient_appointment": book_patient_appointment, "cancel_patient_appointment": cancel_patient_appointment}


def execute(payload: dict[str, Any]) -> Any:
    operation = payload.get("operation")
    if operation not in OPERATIONS:
        raise ValueError("This MongoDB operation is not approved.")
    return OPERATIONS[operation](payload.get("payload", {}))


def main() -> None:
    try:
        print(json.dumps({"result": execute(json.loads(sys.stdin.read()))}, default=str), flush=True)
    except Exception as error:
        print(json.dumps({"error": str(error)}), flush=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()

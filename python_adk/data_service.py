"""Read-only MongoDB data access for the guarded Python Google ADK runtime.

Deterministic member, profile, card, and appointment mutations belong to
core_service.py. This module deliberately exposes only callback-safe reads.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from pymongo import MongoClient

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
    db.memberCardRequests.create_index([("patientId", 1), ("status", 1)], unique=True, partialFilterExpression={"status": "submitted"}, name="card_requests_patient_submitted_unique")
    db.memberCardRequests.create_index("submittedAt", name="card_requests_submitted_at")
    db.appointmentSlots.create_index([("specialty", 1), ("status", 1)], name="slots_specialty_status")
    db.patientAppointments.create_index([("patientId", 1), ("status", 1)], name="appointments_patient_status")
    db.patientAppointments.create_index("slotId", unique=True, sparse=True, name="appointments_slot_unique")
    db.policyEvidence.create_index([("plan", 1), ("relevance", -1)], name="evidence_plan_relevance")


def patient_view(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": document["_id"],
        "name": document["name"],
        "initials": document["initials"],
        "dateOfBirth": document["dateOfBirth"],
        "plan": document["plan"],
        "memberId": document["memberId"],
        "planStatus": document["planStatus"],
        "specialistCopay": document["specialistCopay"],
        "deductibleRemaining": document["deductibleRemaining"],
        "medications": document.get("medications", []),
        "allergies": document.get("allergies", []),
    }


def slot_view(document: dict[str, Any]) -> dict[str, Any]:
    return {"id": document["_id"], "clinician": document["clinician"], "specialty": document["specialty"], "dayLabel": document["dayLabel"], "timeLabel": document["timeLabel"], "location": document["location"]}


def find_patient(db, patient_id: str) -> dict[str, Any]:
    patient = db.patients.find_one({"_id": patient_id})
    if not patient:
        raise ValueError("The verified patient record was not found.")
    return patient


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

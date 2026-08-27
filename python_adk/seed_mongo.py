"""Idempotently create NovaCorp’s MongoDB indexes and non-production showcase records."""

from __future__ import annotations

from datetime import datetime, timezone

from data_service import client, database, ensure_indexes


def main() -> None:
    now = datetime.now(timezone.utc)
    patients = [
        {"_id": "patient-avery", "memberId": "NCG-48219", "phoneHash": "d5ccaf599fff846850c97ded2c0e46e29891ae3a5b8abcbd314901ad602dbaac", "name": "Avery Carter", "initials": "AC", "dateOfBirth": "May 18, 1988", "plan": "NovaCorp Gold Plus", "planStatus": "Active", "specialistCopay": "$55", "deductibleRemaining": "$245", "medications": [{"name": "Lisinopril", "dosage": "10 mg · once daily"}, {"name": "Vitamin D3", "dosage": "1,000 IU · once daily"}], "allergies": ["Penicillin", "Shellfish"]},
        {"_id": "patient-maya", "memberId": "NCG-91577", "phoneHash": "646dfe7f55390f80d06b46429826a5bf1dd540ef3d23c4a5319b551fd8ec3efd", "name": "Maya Singh", "initials": "MS", "dateOfBirth": "August 9, 1979", "plan": "NovaCorp Gold Plus", "planStatus": "Active", "specialistCopay": "$35", "deductibleRemaining": "$680", "medications": [{"name": "Metformin", "dosage": "500 mg · twice daily"}, {"name": "Atorvastatin", "dosage": "20 mg · nightly"}], "allergies": ["Latex"]},
        {"_id": "patient-jordan", "memberId": "NCS-76064", "phoneHash": "e7cd31e365415270ae901189915b076f67482f8d4c936ab58dcec363ad1180c2", "name": "Jordan Brooks", "initials": "JB", "dateOfBirth": "January 22, 1991", "plan": "NovaCorp Silver Select", "planStatus": "Active", "specialistCopay": "$70", "deductibleRemaining": "$910", "medications": [{"name": "Albuterol", "dosage": "as needed"}], "allergies": ["Sulfonamides"]},
    ]
    slots = [
        {"_id": "slot-ortho-01", "clinician": "Dr. Mara Leung", "specialty": "Orthopedics", "dayLabel": "Tomorrow", "timeLabel": "8:40 AM", "location": "North Pavilion", "status": "available"},
        {"_id": "slot-ortho-02", "clinician": "Dr. Julian Reyes", "specialty": "Orthopedics", "dayLabel": "Tomorrow", "timeLabel": "10:20 AM", "location": "North Pavilion", "status": "available"},
        {"_id": "slot-cardio-01", "clinician": "Dr. Theo Martin", "specialty": "Cardiology", "dayLabel": "Thursday", "timeLabel": "9:15 AM", "location": "East Medical Center", "status": "available"},
        {"_id": "slot-derm-01", "clinician": "Dr. Priya Shah", "specialty": "Dermatology", "dayLabel": "Friday", "timeLabel": "1:30 PM", "location": "West Pavilion", "status": "available"},
    ]
    evidence = [
        {"_id": "policy-orthopedic-consultation", "document": "NovaCorp Gold Plus Member Handbook", "section": "Specialist office consultations", "page": 42, "plan": "NovaCorp Gold Plus", "relevance": 0.94, "excerpt": "For eligible NovaCorp Gold Plus members, medically necessary specialist office consultations are covered after the applicable specialist office-visit copay. Referral rules must be verified against the member's current plan record."},
        {"_id": "policy-joint-replacement", "document": "NovaCorp Orthopedic Coverage Policy", "section": "Joint replacement review", "page": 16, "plan": "NovaCorp Gold Plus", "relevance": 0.91, "excerpt": "Knee replacement procedures require prior authorization and clinical review. Coverage remains subject to plan eligibility and member cost share. This excerpt does not establish approval for an individual case."},
    ]
    appointments = [
        {"_id": "appointment-avery-pcp", "patientId": "patient-avery", "slotId": "existing-avery-pcp", "clinician": "Dr. Elena Park", "specialty": "Primary care", "dateLabel": "September 3", "timeLabel": "2:15 PM", "location": "Central Clinic", "status": "scheduled", "confirmationCode": "NC-AVERY-0412"},
        {"_id": "appointment-maya-cardio", "patientId": "patient-maya", "slotId": "existing-maya-cardio", "clinician": "Dr. Theo Martin", "specialty": "Cardiology", "dateLabel": "September 5", "timeLabel": "11:00 AM", "location": "East Medical Center", "status": "scheduled", "confirmationCode": "NC-MAYA-9077"},
    ]
    with client() as mongo_client:
        db = database(mongo_client)
        ensure_indexes(db)
        for patient in patients:
            db.patients.update_one({"_id": patient["_id"]}, {"$set": {**patient, "updatedAt": now}, "$setOnInsert": {"createdAt": now}}, upsert=True)
        for slot in slots:
            db.appointmentSlots.update_one({"_id": slot["_id"]}, {"$setOnInsert": {"status": slot["status"], "createdAt": now}, "$set": {"clinician": slot["clinician"], "specialty": slot["specialty"], "dayLabel": slot["dayLabel"], "timeLabel": slot["timeLabel"], "location": slot["location"], "updatedAt": now}}, upsert=True)
        for item in evidence:
            db.policyEvidence.update_one({"_id": item["_id"]}, {"$set": {**item, "updatedAt": now}, "$setOnInsert": {"createdAt": now}}, upsert=True)
        for appointment in appointments:
            db.patientAppointments.update_one({"_id": appointment["_id"]}, {"$set": {**appointment, "updatedAt": now}, "$setOnInsert": {"createdAt": now}}, upsert=True)
    print("Seeded MongoDB indexes, 3 patient profiles, cited policy evidence, appointments, and availability.")


if __name__ == "__main__":
    main()

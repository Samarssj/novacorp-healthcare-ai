import os
import unittest
import uuid

import core_service
from data_service import client, database, now


@unittest.skipUnless(os.environ.get("MONGODB_URI"), "MONGODB_URI is required for MongoDB core integration tests")
class NovaCorpPythonMongoCoreTests(unittest.TestCase):
    def setUp(self):
        self.db = database(client())
        self.test_slot_id = f"slot-python-core-{uuid.uuid4().hex[:10]}"
        self.db.appointmentSlots.insert_one({
            "_id": self.test_slot_id,
            "clinician": "Dr. Test Morgan",
            "specialty": "Dermatology",
            "dayLabel": "Test day",
            "timeLabel": "10:00 AM",
            "location": "Test Clinic",
            "status": "available",
            "createdAt": now(),
            "updatedAt": now(),
        })
        self.created_patient_id = None

    def tearDown(self):
        self.db.patientAppointments.delete_many({"slotId": self.test_slot_id})
        self.db.appointmentSlots.delete_one({"_id": self.test_slot_id})
        if self.created_patient_id:
            self.db.memberCardRequests.delete_many({"patientId": self.created_patient_id})
            self.db.patients.delete_one({"_id": self.created_patient_id})

    def test_python_core_reserves_and_releases_a_confirmed_patient_scoped_slot(self):
        confirmation = core_service.book_confirmed_appointment({"patientId": "patient-avery", "slotId": self.test_slot_id, "confirmed": True})
        self.assertEqual(confirmation["status"], "confirmed")
        self.assertEqual(confirmation["id"], self.test_slot_id)
        appointment = self.db.patientAppointments.find_one({"patientId": "patient-avery", "slotId": self.test_slot_id, "status": "scheduled"})
        self.assertIsNotNone(appointment)
        cancellation = core_service.cancel_confirmed_appointment({"patientId": "patient-avery", "appointmentId": appointment["_id"], "confirmed": True})
        self.assertEqual(cancellation["status"], "cancelled")
        self.assertEqual(self.db.appointmentSlots.find_one({"_id": self.test_slot_id})["status"], "available")

    def test_python_core_rejects_an_unconfirmed_appointment_request(self):
        with self.assertRaises(ValueError):
            core_service.book_confirmed_appointment({"patientId": "patient-avery", "slotId": self.test_slot_id, "confirmed": False})
        self.assertEqual(self.db.appointmentSlots.find_one({"_id": self.test_slot_id})["status"], "available")

    def test_python_core_persists_new_member_and_reuses_an_active_lost_card_request(self):
        phone = f"+1555{uuid.uuid4().int % 10_000_000:07d}"
        patient = core_service.register_member({
            "name": "Python Core Test",
            "dateOfBirth": "1992-08-19",
            "phoneNumber": phone,
            "address": {"line1": "9 Service Lane", "city": "Austin", "state": "Texas", "postalCode": "78701", "country": "United States"},
        })
        self.created_patient_id = patient["id"]
        self.assertTrue(patient["memberId"].startswith("NCM-"))
        updated = core_service.update_member_profile({
            "patientId": patient["id"],
            "name": "Python Core Updated",
            "dateOfBirth": "1992-08-19",
            "phoneNumber": phone,
            "address": {"line1": "10 Service Lane", "city": "Austin", "state": "Texas", "postalCode": "78702", "country": "United States"},
        })
        self.assertEqual(updated["name"], "Python Core Updated")
        first = core_service.request_lost_member_card({"patientId": patient["id"]})
        second = core_service.request_lost_member_card({"patientId": patient["id"]})
        self.assertEqual(first["reference"], second["reference"])


if __name__ == "__main__":
    unittest.main()

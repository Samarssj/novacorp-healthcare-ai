import os
import unittest

import core_service
import data_service
import runner


class NovaCorpPythonCoreTests(unittest.TestCase):
    def test_normalizes_credentials_without_using_the_browser_layer(self):
        self.assertEqual(core_service.normalize_member_id(" ncg 48219 "), "NCG-48219")
        self.assertEqual(core_service.normalize_phone_number("555-010-4821"), "+15550104821")
        self.assertTrue(core_service.is_valid_member_id("NCG-48219"))
        self.assertFalse(core_service.is_valid_member_id("6001"))

    def test_unusable_member_ids_have_bounded_python_owned_escalation(self):
        original_offline = os.environ.get("NOVACORP_ADK_OFFLINE")
        os.environ["NOVACORP_ADK_OFFLINE"] = "1"
        try:
            first = core_service.continue_member_conversation({"stage": "awaiting_member_id", "message": "6001"})
            second = core_service.continue_member_conversation({"stage": "awaiting_member_id", "message": "sí sí sí hermano", "failedAttempts": first["failedAttempts"]})
            third = core_service.continue_member_conversation({"stage": "awaiting_member_id", "message": "sí 69", "failedAttempts": second["failedAttempts"]})
            self.assertEqual(first["failedAttempts"], 1)
            self.assertEqual(second["failedAttempts"], 2)
            self.assertEqual(third["stage"], "escalated")
            self.assertIn("live agent", third["reply"].lower())
        finally:
            if original_offline is None:
                os.environ.pop("NOVACORP_ADK_OFFLINE", None)
            else:
                os.environ["NOVACORP_ADK_OFFLINE"] = original_offline

    def test_terminal_and_handoff_intent_is_decided_without_adk_or_patient_data(self):
        live_agent = core_service.continue_member_conversation({"stage": "awaiting_member_id", "message": "Connect me to living"})
        language_handoff = core_service.continue_member_conversation({"stage": "awaiting_member_id", "message": "I don't Engels"})
        ending = core_service.continue_member_conversation({"stage": "awaiting_member_id", "message": "Jesse de session"})
        self.assertEqual(live_agent["stage"], "escalated")
        self.assertEqual(language_handoff["stage"], "escalated")
        self.assertEqual(ending["stage"], "ended")

    def test_validates_complete_persistent_member_profile_inputs(self):
        profile = core_service.validate_member_profile({
            "name": "Taylor Morgan",
            "dateOfBirth": "1994-04-16",
            "phoneNumber": "555-010-4455",
            "address": {"line1": "101 Care Way", "city": "Austin", "state": "Texas", "postalCode": "78701", "country": "United States"},
        })
        self.assertEqual(profile["name"], "Taylor Morgan")
        self.assertEqual(profile["address"]["city"], "Austin")
        self.assertEqual(len(profile["phoneHash"]), 64)

    def test_rejects_unapproved_or_untyped_core_operations(self):
        with self.assertRaises(ValueError):
            core_service.execute({"operation": "adk_mutation", "payload": {}})
        with self.assertRaises(ValueError):
            core_service.execute({"operation": "verify_member", "payload": "not-a-record"})

    def test_adk_data_layer_is_read_only_while_mutations_remain_in_the_python_core(self):
        self.assertFalse(hasattr(data_service, "book_patient_appointment"))
        self.assertFalse(hasattr(data_service, "cancel_patient_appointment"))
        self.assertNotIn("book_appointment", runner.ALLOWED_TOOLS)
        self.assertIn("book_confirmed_appointment", core_service.OPERATIONS)


if __name__ == "__main__":
    unittest.main()

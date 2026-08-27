import unittest
import asyncio
import os
from types import SimpleNamespace

import runner


EVIDENCE = [{
    "id": "policy-orthopedic-consultation",
    "document": "NovaCorp Gold Plus Member Handbook",
    "section": "Specialist office consultations",
    "page": 42,
    "plan": "NovaCorp Gold Plus",
    "relevance": 0.94,
    "excerpt": "Specialist office consultations are covered after the applicable copay.",
}]


class FakeToolContext:
    def __init__(self, patient_id: str):
        self.state = {"patient_id": patient_id}


class NovaCorpAdkRuntimeTests(unittest.TestCase):
    def test_builds_the_official_python_adk_agent_with_callbacks(self):
        agent = runner.build_care_agent()
        self.assertEqual(agent.name, "novacorp_care_coordinator")
        self.assertIsNotNone(agent.before_model_callback)
        self.assertIsNotNone(agent.before_tool_callback)

    def test_routes_policy_and_appointment_queries_to_the_correct_callback_categories(self):
        self.assertEqual(runner.route_for("Does my plan cover an orthopedic consultation?"), {"insurance": True, "appointment": True})
        self.assertEqual(runner.route_for("Show my medications"), {"insurance": False, "appointment": False})

    def test_rejects_a_coverage_reply_without_the_retrieved_citation(self):
        self.assertFalse(runner.reply_is_grounded("Your plan covers the specialist visit.", EVIDENCE))
        cited = "Your plan supports a specialist visit. [NovaCorp Gold Plus Member Handbook, Specialist office consultations, p. 42]"
        self.assertTrue(runner.reply_is_grounded(cited, EVIDENCE))

    def test_prevents_the_adk_agent_from_calling_mutation_tools(self):
        blocked = runner.before_tool_callback(SimpleNamespace(name="book_appointment"), {}, FakeToolContext("patient-avery"))
        self.assertEqual(blocked["status"], "error")

    def test_requires_a_verified_patient_id_for_all_adk_tool_callbacks(self):
        blocked = runner.before_tool_callback(SimpleNamespace(name="get_patient_summary"), {}, FakeToolContext("unverified"))
        self.assertEqual(blocked["status"], "error")

    def test_model_failure_uses_the_grounded_python_callback_fallback(self):
        original_summary = runner.fetch_patient_summary
        original_policy = runner.retrieve_policy_evidence
        original_slots = runner.retrieve_appointment_slots
        original_adk = runner.run_adk
        runner.fetch_patient_summary = lambda _patient_id: {
            "id": "patient-avery", "name": "Avery Carter", "plan": "NovaCorp Gold Plus", "specialistCopay": "$55"
        }
        runner.retrieve_policy_evidence = lambda _patient, _query: EVIDENCE
        runner.retrieve_appointment_slots = lambda _patient_id, _query: []

        async def unavailable_adk(_message, _patient_id):
            raise RuntimeError("quota temporarily unavailable")

        runner.run_adk = unavailable_adk
        try:
            result = asyncio.run(runner.execute({"patientId": "patient-avery", "message": "Does my plan cover an orthopedic consultation?"}))
        finally:
            runner.fetch_patient_summary = original_summary
            runner.retrieve_policy_evidence = original_policy
            runner.retrieve_appointment_slots = original_slots
            runner.run_adk = original_adk
        self.assertEqual(result["coordinatorMode"], "safe-fallback")
        self.assertIn("NovaCorp Gold Plus Member Handbook", result["reply"])

    def test_access_clarifier_never_uses_credentials_or_patient_data_and_has_a_safe_fallback(self):
        reply = runner.access_fallback_reply("invalid_member_id", 2)
        self.assertTrue(runner.access_reply_is_safe(reply, "invalid_member_id", 2))
        self.assertFalse(runner.access_reply_is_safe("Your patient policy says you are covered.", "invalid_member_id", 2))
        result = asyncio.run(runner.compose_access_reply({"intent": "live_agent", "stage": "escalated"}))
        self.assertIn("live agent", result["reply"].lower())
        self.assertEqual(result["mode"], "deterministic")

    def test_access_clarifier_accepts_only_safe_labels_and_never_needs_patient_context(self):
        original_offline = os.environ.get("NOVACORP_ADK_OFFLINE")
        os.environ["NOVACORP_ADK_OFFLINE"] = "1"
        try:
            result = asyncio.run(runner.compose_access_reply({"intent": "invalid_phone", "stage": "awaiting_phone", "remainingAttempts": 1}))
            self.assertIn("1 attempt", result["reply"].lower())
            with self.assertRaises(ValueError):
                asyncio.run(runner.compose_access_reply({"intent": "patient_summary", "stage": "awaiting_phone"}))
        finally:
            if original_offline is None:
                os.environ.pop("NOVACORP_ADK_OFFLINE", None)
            else:
                os.environ["NOVACORP_ADK_OFFLINE"] = original_offline


if __name__ == "__main__":
    unittest.main()

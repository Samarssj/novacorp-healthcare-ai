import { afterEach, describe, expect, it } from "vitest";
import { runPythonCore } from "./pythonCore";

type ConversationResult = { stage: string; reply: string; failedAttempts: number; memberId?: string; patient?: { id: string; memberId: string } };

const originalOfflineMode = process.env.NOVACORP_ADK_OFFLINE;

afterEach(() => {
  if (originalOfflineMode === undefined) delete process.env.NOVACORP_ADK_OFFLINE;
  else process.env.NOVACORP_ADK_OFFLINE = originalOfflineMode;
});

describe.runIf(Boolean(process.env.MONGODB_URI))("Python-first member verification transport", () => {
  it("forwards normalized dual credential verification to the deterministic Python core", async () => {
    const result = await runPythonCore<ConversationResult>("continue_member_conversation", {
      stage: "awaiting_member_id", message: " ncg 48219 ", failedAttempts: 0,
    });
    expect(result).toMatchObject({ stage: "awaiting_phone", memberId: "NCG-48219", failedAttempts: 0 });
    const verified = await runPythonCore<ConversationResult>("continue_member_conversation", {
      stage: "awaiting_phone", memberId: result.memberId, message: "555010 4821", failedAttempts: 0,
    });
    expect(verified).toMatchObject({ stage: "verified", patient: { id: "patient-avery", memberId: "NCG-48219" } });
  }, 30_000);

  it("forwards terminal live-agent and fuzzy closing outcomes without invoking patient data", async () => {
    process.env.NOVACORP_ADK_OFFLINE = "1";
    const handoff = await runPythonCore<ConversationResult>("continue_member_conversation", {
      stage: "awaiting_member_id", message: "Connect me to living", failedAttempts: 0,
    });
    const ending = await runPythonCore<ConversationResult>("continue_member_conversation", {
      stage: "awaiting_member_id", message: "Jesse de session", failedAttempts: 0,
    });
    expect(handoff).toMatchObject({ stage: "escalated", failedAttempts: 0 });
    expect(ending).toMatchObject({ stage: "ended", failedAttempts: 0 });
  }, 30_000);

  it("forwards bounded invalid-ID escalation from the Python core", async () => {
    process.env.NOVACORP_ADK_OFFLINE = "1";
    const first = await runPythonCore<ConversationResult>("continue_member_conversation", { stage: "awaiting_member_id", message: "6001", failedAttempts: 0 });
    const second = await runPythonCore<ConversationResult>("continue_member_conversation", { stage: "awaiting_member_id", message: "sí sí sí hermano", failedAttempts: first.failedAttempts });
    const third = await runPythonCore<ConversationResult>("continue_member_conversation", { stage: "awaiting_member_id", message: "sí 69", failedAttempts: second.failedAttempts });
    expect(first).toMatchObject({ stage: "awaiting_member_id", failedAttempts: 1 });
    expect(second).toMatchObject({ stage: "awaiting_member_id", failedAttempts: 2 });
    expect(third).toMatchObject({ stage: "escalated", failedAttempts: 3 });
  }, 30_000);
});

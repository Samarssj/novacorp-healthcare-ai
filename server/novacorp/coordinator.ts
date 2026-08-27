import type { AgentActivity, CoordinatorResult } from "@shared/novacorp";
import { runPythonAdkCoordinator } from "./adkRunner";

export type CoordinatorProgressListener = (activities: AgentActivity[]) => void;

/**
 * The React/TypeScript service deliberately performs no LLM reasoning. It first
 * validates the signed patient session, then this bridge invokes the official
 * Python Google ADK runner where all agent orchestration and callbacks execute.
 */
export async function runCoordinator(input: { patientId: string; message: string }, onProgress?: CoordinatorProgressListener): Promise<CoordinatorResult> {
  onProgress?.([
    { agent: "Coordinator", action: "Starting Python ADK", state: "active", detail: "Preparing verified, patient-scoped ADK callbacks." },
    { agent: "Patient Agent", action: "Profile queued", state: "waiting", detail: "Waiting for a Python ADK callback." },
    { agent: "Insurance RAG", action: "Evidence queued", state: "waiting", detail: "Waiting for a Python ADK callback." },
    { agent: "Appointment Agent", action: "Availability queued", state: "waiting", detail: "Waiting for a Python ADK callback." },
    { agent: "Summary Agent", action: "ADK response queued", state: "waiting", detail: "Waiting for the guarded Python ADK response." },
  ]);
  const result = await runPythonAdkCoordinator(input);
  onProgress?.(result.activities);
  return result;
}

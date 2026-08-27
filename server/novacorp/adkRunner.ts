import { spawn } from "node:child_process";
import type { CoordinatorResult } from "@shared/novacorp";

type AdkInput = { patientId: string; message: string };

function parseCoordinatorResult(value: unknown): CoordinatorResult {
  if (!value || typeof value !== "object") throw new Error("Python ADK returned an invalid response.");
  const result = value as Partial<CoordinatorResult> & { error?: unknown };
  if (typeof result.error === "string") throw new Error(result.error);
  if (typeof result.reply !== "string" || !Array.isArray(result.activities) || !Array.isArray(result.evidence) || !Array.isArray(result.slots) || typeof result.needsConfirmation !== "boolean" || (result.coordinatorMode !== "adk" && result.coordinatorMode !== "safe-fallback")) {
    throw new Error("Python ADK returned an incomplete care response.");
  }
  return { ...result, bookingDraft: result.bookingDraft ?? undefined } as CoordinatorResult;
}

/**
 * Executes the official Python Google ADK runtime once per already verified care
 * request. TypeScript is intentionally only the transport adapter for the React
 * workspace; Python owns agent orchestration and ADK function-tool callbacks.
 */
export async function runPythonAdkCoordinator(input: AdkInput): Promise<CoordinatorResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_BINARY ?? "python3", ["python_adk/runner.py"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 60_000);
    child.stdout.on("data", chunk => { stdout += String(chunk); });
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    child.on("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", code => {
      clearTimeout(timeout);
      try {
        const line = stdout.trim().split("\n").filter(Boolean).at(-1);
        if (!line) throw new Error(stderr || "Python ADK process returned no response.");
        const result = parseCoordinatorResult(JSON.parse(line));
        if (code !== 0) throw new Error(stderr || "Python ADK process failed.");
        resolve(result);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Python ADK process failed."));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

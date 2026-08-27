import { spawn } from "node:child_process";

export type PythonCoreOperation =
  | "verify_member"
  | "continue_member_conversation"
  | "register_member"
  | "get_patient_workspace"
  | "update_member_profile"
  | "get_or_create_member_card"
  | "request_lost_member_card"
  | "book_confirmed_appointment"
  | "cancel_confirmed_appointment";

/**
 * Request-scoped transport to Python's deterministic member domain. Node keeps
 * HTTP/tRPC/cookie concerns; Python validates and executes all business work.
 */
export async function runPythonCore<TResult>(operation: PythonCoreOperation, payload: Record<string, unknown>): Promise<TResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_BINARY ?? "python3", ["python_adk/core_service.py"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 45_000);
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
        if (!line) throw new Error(stderr || "Python core process returned no response.");
        const parsed = JSON.parse(line) as { result?: TResult; error?: unknown };
        if (typeof parsed.error === "string") throw new Error(parsed.error);
        if (code !== 0 || !("result" in parsed)) throw new Error(stderr || "Python core process failed.");
        resolve(parsed.result as TResult);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Python core process failed."));
      }
    });
    child.stdin.end(JSON.stringify({ operation, payload }));
  });
}

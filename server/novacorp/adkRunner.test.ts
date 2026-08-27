import { afterEach, describe, expect, it } from "vitest";
import { runPythonAdkCoordinator } from "./adkRunner";

const originalOfflineMode = process.env.NOVACORP_ADK_OFFLINE;

afterEach(() => {
  if (originalOfflineMode === undefined) delete process.env.NOVACORP_ADK_OFFLINE;
  else process.env.NOVACORP_ADK_OFFLINE = originalOfflineMode;
});

describe.runIf(Boolean(process.env.MONGODB_URI))("Python Google ADK coordinator bridge", () => {
  it("executes the request-scoped Python ADK callback workflow without allowing autonomous booking", async () => {
    process.env.NOVACORP_ADK_OFFLINE = "1";
    const result = await runPythonAdkCoordinator({ patientId: "patient-avery", message: "Does my plan cover an orthopedic consultation and what is the earliest appointment?" });

    expect(result.coordinatorMode).toBe("safe-fallback");
    expect(result.activities[0]).toMatchObject({ action: "Python ADK orchestration complete" });
    expect(result.evidence[0]).toMatchObject({ document: "NovaCorp Gold Plus Member Handbook", page: 42 });
    expect(result.bookingDraft).toMatchObject({ specialty: "Orthopedics" });
    expect(result.reply).toMatch(/No appointment has been booked/i);
  }, 20_000);
});

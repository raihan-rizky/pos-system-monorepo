import { describe, expect, it } from "vitest";
import {
  formatEffectiveDuration,
  getEffectiveDurationSeconds,
  getPauseDurationSeconds,
} from "../shift-pause";

describe("shift pause calculations", () => {
  it("calculates a pause interval in whole seconds", () => {
    expect(
      getPauseDurationSeconds(
        "2026-08-02T09:00:00.000Z",
        "2026-08-02T09:15:30.000Z",
      ),
    ).toBe(930);
  });

  it("subtracts an active pause from an open shift", () => {
    expect(
      getEffectiveDurationSeconds(
        {
          openedAt: "2026-08-02T08:00:00.000Z",
          pausedAt: "2026-08-02T09:00:00.000Z",
          pausedDurationSeconds: 600,
        },
        new Date("2026-08-02T10:00:00.000Z"),
      ),
    ).toBe(3000);
  });

  it("subtracts completed pauses from a closed shift", () => {
    expect(
      getEffectiveDurationSeconds({
        openedAt: "2026-08-02T08:00:00.000Z",
        closedAt: "2026-08-02T12:00:00.000Z",
        pausedDurationSeconds: 1800,
      }),
    ).toBe(12600);
  });

  it("does not produce a negative duration", () => {
    expect(
      getEffectiveDurationSeconds(
        {
          openedAt: "2026-08-02T10:00:00.000Z",
          pausedAt: "2026-08-02T09:00:00.000Z",
        },
        new Date("2026-08-02T10:00:00.000Z"),
      ),
    ).toBe(0);
  });

  it("formats effective duration using the existing Indonesian style", () => {
    expect(formatEffectiveDuration(0)).toBe("0 mnt");
    expect(formatEffectiveDuration(65 * 60)).toBe("1j 5m");
  });
});

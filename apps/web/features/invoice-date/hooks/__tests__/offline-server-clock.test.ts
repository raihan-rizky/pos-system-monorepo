import { afterEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ state: null as any, effect: null as null | (() => void | (() => void)) }));
vi.mock("react", () => ({
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => {
    harness.state = value;
    return [value, (update: any) => { harness.state = typeof update === "function" ? update(harness.state) : update; }];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => { harness.effect = effect; },
}));

import { useServerClock } from "../useServerClock";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("advances the unverified device clock when no server anchor is available", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T00:00:00.000Z"));
  vi.stubGlobal("window", {
    sessionStorage: { getItem: () => null }, setInterval, clearInterval,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: "visible" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  useServerClock();
  const cleanup = harness.effect?.();
  await vi.advanceTimersByTimeAsync(3000);
  expect(harness.state.source).toBe("DEVICE_UNVERIFIED");
  expect(harness.state.now.toISOString()).toBe("2026-11-01T00:00:03.000Z");
  if (typeof cleanup === "function") cleanup();
});

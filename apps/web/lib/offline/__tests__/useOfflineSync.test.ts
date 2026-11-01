import { afterEach, beforeEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  userId: "cashier-1" as string | null,
  storeId: "store-1" as string | null,
  sync: vi.fn(),
}));

vi.mock("react", () => ({
  useState: (value: unknown) => [value, vi.fn()],
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
}));
vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({ userId: harness.userId, storeId: harness.storeId }),
}));
vi.mock("@/lib/offline/offline-work-sync", () => ({ syncOfflineWork: harness.sync }));
vi.mock("@/lib/offline/offline-db", () => ({
  getOfflineQueueSummary: vi.fn().mockResolvedValue({ pending: 0, syncing: 0, failed: 0, pendingApproval: 0, lastSyncAt: null }),
  getOfflineQueueRecords: vi.fn().mockResolvedValue([]),
  offlineDb: { offlineShifts: { orderBy: () => ({ reverse: () => ({ toArray: async () => [] }) }) } },
}));

import { useOfflineSync } from "@/hooks/useOfflineSync";

beforeEach(() => {
  harness.effects = [];
  harness.cleanups = [];
  harness.userId = "cashier-1";
  harness.storeId = "store-1";
  harness.sync.mockReset().mockResolvedValue({ synced: 0, pendingApproval: 0, failed: 0 });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
});
afterEach(() => {
  harness.cleanups.forEach(cleanup => cleanup());
  vi.unstubAllGlobals();
});

it("passes the current cashier and store to manual synchronization", async () => {
  await useOfflineSync().syncNow();
  expect(harness.sync).toHaveBeenCalledWith({ cashierId: "cashier-1", storeId: "store-1" });
});

it("starts synchronization on app startup when online", async () => {
  useOfflineSync();
  for (const effect of harness.effects) {
    const cleanup = effect();
    if (cleanup) harness.cleanups.push(cleanup);
  }
  await vi.waitFor(() => expect(harness.sync).toHaveBeenCalledWith({ cashierId: "cashier-1", storeId: "store-1" }));
});

it("does not synchronize when cashier identity is unavailable", async () => {
  harness.userId = null;
  await useOfflineSync().syncNow();
  expect(harness.sync).not.toHaveBeenCalled();
});

it("periodically retries online so expired claims can recover without a reconnect", async () => {
  useOfflineSync();
  for (const effect of harness.effects) {
    const cleanup = effect();
    if (cleanup) harness.cleanups.push(cleanup);
  }
  expect(window.setInterval).toHaveBeenCalledWith(expect.any(Function), 60_000);
  const callback = vi.mocked(window.setInterval).mock.calls[0][0] as () => void;
  callback();
  await vi.waitFor(() => expect(harness.sync).toHaveBeenCalled());
});

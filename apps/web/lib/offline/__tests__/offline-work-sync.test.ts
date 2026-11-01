import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  shifts: new Map<string, any>(),
  transactions: [] as any[],
  locks: new Map<string, any>(),
  serial: Promise.resolve(),
  calls: [] as string[],
}));

vi.mock("../offline-db", () => ({
  offlineDb: {
    offlineShifts: {
      orderBy: () => ({ toArray: async () => [...state.shifts.values()].map((item) => structuredClone(item)) }),
      get: async (id: string) => structuredClone(state.shifts.get(id)),
      update: async (id: string, changes: object) => Object.assign(state.shifts.get(id), changes),
    },
    offlineTransactions: { toArray: async () => structuredClone(state.transactions) },
    syncLocks: {
      get: async (id: string) => state.locks.get(id),
      put: async (lock: any) => state.locks.set(lock.id, lock),
      update: async (id: string, changes: object) => Object.assign(state.locks.get(id), changes),
      delete: async (id: string) => state.locks.delete(id),
    },
    transaction: async (...args: any[]) => {
      const result = state.serial.then(() => args.at(-1)());
      state.serial = result.then(() => undefined, () => undefined);
      return result;
    },
  },
}));

vi.mock("../offline-sync-client", () => ({
  syncOfflineTransactions: async (_identity: unknown, shiftId: string | null) => {
    state.calls.push(`sales:${shiftId ?? "unassigned"}`);
    return { synced: 0, pendingApproval: 0, failed: 0 };
  },
}));

import { syncOfflineWork } from "../offline-work-sync";

const identity = { cashierId: "cashier-1", storeId: "store-1" };
beforeEach(() => {
  state.shifts.clear(); state.transactions = []; state.locks.clear(); state.calls = [];
  state.serial = Promise.resolve();
  state.shifts.set("shift-1", {
    id: "shift-1", ...identity, openingBalance: 100, status: "CLOSED",
    closingBalance: 300, openedAt: "2026-11-01T00:00:00.000Z", closedAt: "2026-11-01T01:00:00.000Z",
    openSynced: false, closeSynced: false, note: null, closeNote: null,
  });
  vi.stubGlobal("window", { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn(), dispatchEvent: vi.fn() });
  vi.stubGlobal("CustomEvent", class {});
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    state.calls.push(url.endsWith("/close") ? "close" : "open");
    return { ok: true, json: async () => ({}) };
  }));
});
afterEach(() => vi.unstubAllGlobals());

it("replays the opening, its sales and the closing in order", async () => {
  await syncOfflineWork(identity);
  expect(state.calls).toEqual(["sales:unassigned", "open", "sales:shift-1", "close"]);
  expect(state.shifts.get("shift-1")).toMatchObject({ openSynced: true, closeSynced: true });
});

it("sends the original cashier and store with an offline shift opening", async () => {
  await syncOfflineWork(identity);
  const opening = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/shifts");
  expect(JSON.parse(opening?.[1]?.body as string)).toMatchObject({
    originCashierId: "cashier-1", originStoreId: "store-1",
  });
});

it("keeps a shift open on the server when a sale still needs attention", async () => {
  state.transactions.push({
    clientMutationId: "sale-1", status: "FAILED_FINAL", serverTransactionId: null,
    createdAt: "2026-11-01T00:30:00.000Z", payload: { originCashierId: identity.cashierId, originStoreId: identity.storeId, shiftId: "shift-1" },
  });
  await expect(syncOfflineWork(identity)).rejects.toThrow("transaksi shift");
  expect(state.calls).not.toContain("close");
  expect(state.shifts.get("shift-1").syncError).toContain("transaksi shift");
});

it("keeps another tab from replaying work while a lease is live", async () => {
  state.locks.set("offline-work", { id: "offline-work", owner: "other-tab", expiresAt: Date.now() + 60_000 });
  await syncOfflineWork(identity);
  expect(state.calls).toEqual([]);
  expect(state.locks.get("offline-work").owner).toBe("other-tab");
});

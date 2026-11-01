import { afterEach, expect, it, vi } from "vitest";
import { getOfflineQueueSummary, offlineDb } from "../offline-db";

afterEach(() => vi.restoreAllMocks());

it("only summarizes records belonging to the signed-in cashier and store", async () => {
  const rows = [
    { status: "PENDING_SYNC", payload: { originCashierId: "cashier-1", originStoreId: "store-1" }, syncedAt: null },
    { status: "SYNCED", payload: { originCashierId: "cashier-1", originStoreId: "store-1" }, syncedAt: "2026-11-01T01:00:00.000Z" },
    { status: "FAILED_FINAL", payload: { originCashierId: "cashier-2", originStoreId: "store-1" }, syncedAt: null },
    { status: "PENDING_SYNC", payload: { originCashierId: "cashier-1", originStoreId: "store-2" }, syncedAt: null },
    { status: "SYNCED", payload: {}, syncedAt: "2026-11-02T01:00:00.000Z" },
  ];
  const collection = (selected: typeof rows) => ({
    anyOf: (statuses: string[]) => collection(selected.filter((row) => statuses.includes(row.status))),
    equals: (status: string) => collection(selected.filter((row) => row.status === status)),
    above: (value: string) => collection(selected.filter((row) => row.syncedAt && row.syncedAt > value)),
    filter: (predicate: (row: typeof rows[number]) => boolean) => collection(selected.filter(predicate)),
    reverse: () => collection([...selected].sort((a, b) => (b.syncedAt || "").localeCompare(a.syncedAt || ""))),
    count: async () => selected.length,
    first: async () => selected[0],
    toArray: async () => selected,
  });
  vi.spyOn(offlineDb.offlineTransactions, "where").mockImplementation(() => collection(rows) as never);
  vi.spyOn(offlineDb.offlineTransactions, "toArray").mockResolvedValue(rows as never);

  expect(await getOfflineQueueSummary({ cashierId: "cashier-1", storeId: "store-1" })).toEqual({
    pending: 1, syncing: 0, failed: 0, pendingApproval: 0, lastSyncAt: "2026-11-01T01:00:00.000Z",
  });
});

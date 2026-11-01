import { afterEach, expect, it, vi } from "vitest";
import { clearSyncedOfflineTransactions, offlineDb } from "../offline-db";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("removes only records confirmed saved on the server", async () => {
  const rows = [
    { status: "SYNCED", serverTransactionId: "saved", payload: { originStoreId: "store-1" } },
    { status: "PENDING_APPROVAL", serverTransactionId: "approval", payload: { originStoreId: "store-1" } },
    { status: "SYNCED", serverTransactionId: null, payload: { originStoreId: "store-1" } },
    { status: "FAILED_FINAL", serverTransactionId: null, payload: { originStoreId: "store-1" } },
    { status: "FAILED_RETRYABLE", serverTransactionId: null, payload: { originStoreId: "store-1" } },
  ];
  let selected: typeof rows = [];
  const collection = {
    anyOf: (statuses: string[]) => {
      selected = rows.filter(row => statuses.includes(row.status));
      return collection;
    },
    filter: (predicate: (row: typeof rows[number]) => boolean) => {
      selected = selected.filter(predicate);
      return collection;
    },
    delete: async () => {
      for (const row of selected) rows.splice(rows.indexOf(row), 1);
      return selected.length;
    },
  };
  vi.spyOn(offlineDb.offlineTransactions, "where").mockReturnValue(collection as never);
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("CustomEvent", class {});

  await clearSyncedOfflineTransactions("store-1");

  expect(rows).toEqual([
    { status: "SYNCED", serverTransactionId: null, payload: { originStoreId: "store-1" } },
    { status: "FAILED_FINAL", serverTransactionId: null, payload: { originStoreId: "store-1" } },
    { status: "FAILED_RETRYABLE", serverTransactionId: null, payload: { originStoreId: "store-1" } },
  ]);
});

it("does not delete saved records belonging to another store", async () => {
  const rows = [
    { status: "SYNCED", serverTransactionId: "mine", payload: { originStoreId: "store-1" } },
    { status: "SYNCED", serverTransactionId: "other", payload: { originStoreId: "store-2" } },
    { status: "SYNCED", serverTransactionId: "unknown", payload: {} },
  ];
  let selected: typeof rows = [];
  const collection = {
    anyOf: (statuses: string[]) => { selected = rows.filter(row => statuses.includes(row.status)); return collection; },
    filter: (predicate: (row: typeof rows[number]) => boolean) => { selected = selected.filter(predicate); return collection; },
    delete: async () => { for (const row of selected) rows.splice(rows.indexOf(row), 1); return selected.length; },
  };
  vi.spyOn(offlineDb.offlineTransactions, "where").mockReturnValue(collection as never);
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("CustomEvent", class {});
  await clearSyncedOfflineTransactions("store-1");
  expect(rows.map(row => row.serverTransactionId)).toEqual(["other", "unknown"]);
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  rows: new Map<string, any>(),
  lock: Promise.resolve(),
}));

vi.mock("../offline-db", () => ({
  offlineDb: {
    offlineTransactions: {
      where: () => ({
        anyOf: (statuses: string[]) => ({
          sortBy: async () => [...storage.rows.values()]
            .filter(row => statuses.includes(row.status))
            .map(row => structuredClone(row)),
        }),
      }),
      get: async (id: string) => {
        const row = storage.rows.get(id);
        return row && structuredClone(row);
      },
      update: async (id: string, changes: object) => {
        const row = storage.rows.get(id);
        if (row) Object.assign(row, changes);
        return row ? 1 : 0;
      },
    },
    syncAttempts: { add: async () => 1 },
    transaction: async (...args: any[]) => {
      const callback = args.at(-1);
      const result = storage.lock.then(() => callback());
      storage.lock = result.then(() => undefined, () => undefined);
      return result;
    },
  },
}));

import { syncOfflineTransactions } from "../offline-sync-client";

const identity = { cashierId: "cashier-1", storeId: "store-1" };
function sale(id: string, status = "PENDING_SYNC", origin = identity) {
  return {
    clientMutationId: id, status,
    payload: { originCashierId: origin.cashierId, originStoreId: origin.storeId },
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    retryCount: 0, lastError: null, serverTransactionId: null, syncedAt: null,
  };
}

beforeEach(() => {
  storage.rows.clear();
  storage.lock = Promise.resolve();
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("CustomEvent", class {});
});
afterEach(() => vi.unstubAllGlobals());

it("recovers an abandoned sync while leaving a live claim alone", async () => {
  storage.rows.set("abandoned", sale("abandoned", "SYNCING"));
  storage.rows.set("active", { ...sale("active", "SYNCING"), updatedAt: new Date().toISOString() });
  const fetchMock = vi.fn(async (_url, init) => {
    const submitted = JSON.parse(init.body).transactions;
    return { ok: true, json: async () => ({ results: submitted.map((row: any) => ({ clientMutationId: row.clientMutationId, status: "SYNCED", serverTransactionId: `server-${row.clientMutationId}` })) }) };
  });
  vi.stubGlobal("fetch", fetchMock);

  await syncOfflineTransactions(identity);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(storage.rows.get("abandoned").status).toBe("SYNCED");
  expect(storage.rows.get("active").status).toBe("SYNCING");
});

it("claims a cashier's records once across concurrent tabs and never submits another cashier's or legacy records", async () => {
  storage.rows.set("mine", sale("mine"));
  storage.rows.set("other", sale("other", "PENDING_SYNC", { cashierId: "cashier-2", storeId: "store-1" }));
  storage.rows.set("legacy", { ...sale("legacy"), payload: {} });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fetchMock = vi.fn(async (_url, init) => {
    const submitted = JSON.parse(init.body).transactions;
    await gate;
    return { ok: true, json: async () => ({ results: submitted.map((row: any) => ({ clientMutationId: row.clientMutationId, status: "SYNCED", serverTransactionId: `server-${row.clientMutationId}` })) }) };
  });
  vi.stubGlobal("fetch", fetchMock);

  const first = syncOfflineTransactions(identity);
  const second = syncOfflineTransactions(identity);
  await new Promise(resolve => setTimeout(resolve, 0));
  release();
  await Promise.all([first, second]);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const sent = JSON.parse(fetchMock.mock.calls[0][1].body).transactions;
  expect(sent.map((row: any) => row.clientMutationId)).toEqual(["mine"]);
  expect(storage.rows.get("other").status).toBe("PENDING_SYNC");
  expect(storage.rows.has("legacy")).toBe(true);
});

it("replays the exact online checkout after an interrupted first request", async () => {
  const onlineRequest = {
    clientMutationId: "interrupted",
    items: [{ lineType: "PRINTING_SERVICE", name: "Cetak", quantity: 1, price: 25000 }],
    invoiceDate: "2026-11-01", paymentMethod: "CASH", amountPaid: 30000,
  };
  storage.rows.set("interrupted", { ...sale("interrupted", "SYNCING"), onlineRequest });
  const fetchMock = vi.fn(async () => ({
    ok: true, json: async () => ({ id: "server-sale", status: "COMPLETED" }),
  }));
  vi.stubGlobal("fetch", fetchMock);

  await syncOfflineTransactions(identity);

  expect(fetchMock).toHaveBeenCalledWith("/api/transactions", expect.objectContaining({
    body: JSON.stringify({ ...onlineRequest, originCashierId: identity.cashierId, originStoreId: identity.storeId,
      offlineReplay: { capturedAt: "2026-01-01T00:00:00.000Z" } }),
  }));
  expect(storage.rows.get("interrupted")).toMatchObject({ status: "SYNCED", serverTransactionId: "server-sale" });
});

it("includes the original shift and capture time when replaying a service sale", async () => {
  const onlineRequest = { clientMutationId: "service-sale", items: [{ lineType: "PRINTING_SERVICE" }] };
  storage.rows.set("service-sale", { ...sale("service-sale"), onlineRequest,
    payload: { ...sale("service-sale").payload, shiftId: "shift-1" } });
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, json: async () => ({ id: "server-sale", status: "COMPLETED" }) }));
  vi.stubGlobal("fetch", fetchMock);
  await syncOfflineTransactions(identity, "shift-1");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
    ...onlineRequest, offlineReplay: { shiftId: "shift-1", capturedAt: "2026-01-01T00:00:00.000Z" },
  });
});

it("reconciles an interrupted product sale with its captured time and original ID", async () => {
  storage.rows.set("product-sale", {
    ...sale("product-sale", "SYNCING"), reconcileOffline: true,
    onlineRequest: { clientMutationId: "product-sale", items: [] },
  });
  const fetchMock = vi.fn(async () => ({
    ok: true, json: async () => ({ results: [{ clientMutationId: "product-sale", status: "SYNCED", serverTransactionId: "server-2" }] }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  await syncOfflineTransactions(identity);
  expect(fetchMock).toHaveBeenCalledWith("/api/offline-sync/transactions", expect.objectContaining({
    body: expect.stringContaining('"createdAt":"2026-01-01T00:00:00.000Z"'),
  }));
  expect(storage.rows.get("product-sale").serverTransactionId).toBe("server-2");
});

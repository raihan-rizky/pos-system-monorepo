import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: new Map<string, any>(), shifts: new Map<string, any>(), failWrite: false }));
vi.mock("../offline-db", () => ({
  offlineDb: {
    offlineShifts: { get: async (id: string) => state.shifts.get(id) },
    offlineTransactions: {
      where: () => ({ anyOf: () => ({ count: async () => state.rows.size }) }),
      add: async (row: any) => {
        if (state.failWrite) throw new Error("storage unavailable");
        state.rows.set(row.clientMutationId, structuredClone(row));
      },
      get: async (id: string) => state.rows.get(id),
      update: async (id: string, changes: any) => Object.assign(state.rows.get(id), changes),
    },
    transaction: async (...args: any[]) => args.at(-1)(),
  },
}));

import { resolveCheckoutShiftId, submitCheckoutWithOutbox } from "../checkout-outbox";

const payload = {
  originCashierId: "cashier-1", originStoreId: "store-1", items: [],
  paymentMethod: "CASH" as const, amountPaid: 1000, discount: 0,
  originalSubtotal: 1000, originalTotal: 1000,
};
const request = { clientMutationId: "sale-1", items: [{ name: "Kertas" }], invoiceDate: "2026-11-01" };
beforeEach(() => {
  state.rows.clear(); state.shifts.clear(); state.failWrite = false;
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("CustomEvent", class {});
});

it("does not send or enqueue a checkout from a shift already closed in another tab", async () => {
  state.shifts.set("shift-1", { id: "shift-1", status: "CLOSED", cashierId: "cashier-1", storeId: "store-1" });
  const send = vi.fn();
  await expect(submitCheckoutWithOutbox({ ...payload, shiftId: "shift-1" }, request, send)).rejects.toThrow(/shift/i);
  expect(send).not.toHaveBeenCalled();
  expect(state.rows.size).toBe(0);
});
afterEach(() => vi.unstubAllGlobals());

it("associates checkout with the cashier's active server or local shift", () => {
  expect(resolveCheckoutShiftId({ id: "server-shift", cashierId: "cashier-1", isLocalOnly: false }, "cashier-1")).toBe("server-shift");
  expect(resolveCheckoutShiftId({ id: "local-shift", cashierId: "cashier-1", isLocalOnly: true }, "cashier-1")).toBe("local-shift");
  expect(resolveCheckoutShiftId({ id: "other-shift", cashierId: "cashier-2" }, "cashier-1")).toBeNull();
});

it("persists the exact request and a lease before the first network request", async () => {
  const send = vi.fn(async () => {
    expect(state.rows.get("sale-1")).toMatchObject({ status: "SYNCING", onlineRequest: request });
    expect(state.rows.get("sale-1").syncLeaseExpiresAt).toEqual(expect.any(String));
    return { id: "server-1", status: "COMPLETED" };
  });
  const result = await submitCheckoutWithOutbox(payload, request, send);
  expect(result.kind).toBe("complete");
  expect(state.rows.get("sale-1")).toMatchObject({ status: "SYNCED", serverTransactionId: "server-1" });
});

it("does not send when the durable write fails", async () => {
  state.failWrite = true;
  const send = vi.fn();
  await expect(submitCheckoutWithOutbox(payload, request, send)).rejects.toThrow("storage unavailable");
  expect(send).not.toHaveBeenCalled();
});

it("retains an uncertain result for retry with the same request", async () => {
  const result = await submitCheckoutWithOutbox(payload, request, async () => { throw new TypeError("lost response"); }, new Date(), false);
  expect(result.kind).toBe("queued");
  expect(state.rows.get("sale-1")).toMatchObject({ status: "PENDING_SYNC", onlineRequest: request });
});

it("keeps a rejected request available for inspection without retrying it automatically", async () => {
  const error = Object.assign(new Error("Data pembayaran tidak valid"), { status: 422 });
  const result = await submitCheckoutWithOutbox(payload, request, async () => { throw error; });
  expect(result.kind).toBe("rejected");
  expect(state.rows.get("sale-1")).toMatchObject({ status: "FAILED_FINAL", lastError: error.message });
});

it("uses offline reconciliation after a failed product checkout", async () => {
  const result = await submitCheckoutWithOutbox(payload, request, async () => { throw new TypeError("offline"); });
  expect(result.kind).toBe("queued");
  expect(state.rows.get("sale-1").onlineRequest).toBeUndefined();
});

it("retains the selected invoice date, time and reason in the offline payload", async () => {
  const datedRequest = { ...request, invoiceTime: "09:30", invoiceDateReason: "Koreksi tanggal" };
  await submitCheckoutWithOutbox(payload, datedRequest, async () => { throw new TypeError("offline"); });
  expect(state.rows.get("sale-1").payload).toMatchObject({
    invoiceDate: "2026-11-01", invoiceTime: "09:30", invoiceDateReason: "Koreksi tanggal",
  });
});

it("retains the exact request when the offline API cannot represent its items", async () => {
  const result = await submitCheckoutWithOutbox(payload, request, async () => { throw new TypeError("offline"); }, new Date(), false);
  expect(result.kind).toBe("queued");
  expect(state.rows.get("sale-1").onlineRequest).toEqual(request);
});

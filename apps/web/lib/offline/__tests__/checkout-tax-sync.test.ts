import { describe, expect, it } from "vitest";
import { buildOfflineSyncDecision } from "../offline-sync-core";

const payload = { clientMutationId: "tax-offline", createdAt: "2026-10-18T03:00:00Z", items: [{ productId: "p1", name: "Produk", price: 5000, quantity: 2 }], discount: 0, originalTotal: 10000 };
const context = { now: new Date("2026-10-18T03:01:00Z"), stockByProductId: new Map([["p1", 10]]) };

describe("offline checkout tax", () => {
  it("preserves monetary line discounts before invoice discount and tax", () => {
    const decision = buildOfflineSyncDecision({ ...payload, items: [{ ...payload.items[0], discount: 1500 }], discount: 500, taxRate: 10, originalTotal: 8800 }, context);
    expect(decision).toMatchObject({ resultStatus: "SYNCED", subtotal: 8500, discount: 500, tax: 800, total: 8800 });
    expect(decision.items[0]).toMatchObject({ quantity: 2, discount: 1500 });
  });
  it("clamps line and invoice discounts after reducing stock", () => {
    const decision = buildOfflineSyncDecision({ ...payload, items: [{ ...payload.items[0], discount: 7000 }], discount: 500, taxRate: 10, originalTotal: 2750 }, { ...context, stockByProductId: new Map([["p1", 1]]) });
    expect(decision).toMatchObject({ resultStatus: "PENDING_APPROVAL", subtotal: 0, discount: 0, tax: 0, total: 0 });
    expect(decision.items[0]).toMatchObject({ quantity: 1, discount: 5000 });
  });
  it("allocates stock across repeated products without cloning row discounts", () => {
    const decision = buildOfflineSyncDecision({ ...payload, items: [
      { ...payload.items[0], discount: 1500 }, { ...payload.items[0], discount: 500 },
    ], originalTotal: 18000 }, { ...context, stockByProductId: new Map([["p1", 3]]) });
    expect(decision.items).toMatchObject([{ quantity: 2, discount: 1500 }, { quantity: 1, discount: 500 }]);
    expect(decision).toMatchObject({ resultStatus: "PENDING_APPROVAL", subtotal: 13000, total: 13000 });
  });
  it("preserves item discounts when an expired queue awaits approval", () => {
    const decision = buildOfflineSyncDecision({ ...payload, items: [{ ...payload.items[0], discount: 1500 }], originalTotal: 8500 }, { ...context, now: new Date("2026-11-01T03:01:00Z") });
    expect(decision).toMatchObject({ resultStatus: "PENDING_APPROVAL", reason: "EXPIRED", subtotal: 8500, total: 8500 });
    expect(decision.items[0].discount).toBe(1500);
  });
  it("keeps old queue entries without tax compatible", () => {
    expect(buildOfflineSyncDecision(payload, context)).toMatchObject({ resultStatus: "SYNCED", tax: 0, total: 10000 });
  });
  it("applies decimal tax after discount using the same rounded total as checkout", () => {
    expect(buildOfflineSyncDecision({ ...payload, discount: 1000, taxRate: 12.5, originalTotal: 10125 }, context)).toMatchObject({ resultStatus: "SYNCED", tax: 1125, total: 10125 });
  });
  it("recalculates tax when stock adjustment changes quantity", () => {
    expect(buildOfflineSyncDecision({ ...payload, taxRate: 0.57, originalTotal: 10057 }, { ...context, stockByProductId: new Map([["p1", 1]]) })).toMatchObject({ resultStatus: "PENDING_APPROVAL", subtotal: 5000, tax: 29, total: 5029 });
  });
  it("preserves tax metadata in the computed totals for an expired queue", () => {
    expect(buildOfflineSyncDecision({ ...payload, taxRate: 100, originalTotal: 20000 }, { ...context, now: new Date("2026-11-01T03:01:00Z") })).toMatchObject({ resultStatus: "PENDING_APPROVAL", reason: "EXPIRED", tax: 10000, total: 20000 });
  });
});


describe("offline item discount boundaries", () => {
  it("syncs a valid zero-total sale when every available item is fully discounted", () => {
    const decision = buildOfflineSyncDecision({ ...payload, items: [{ ...payload.items[0], discount: 10000 }], taxRate: 100, originalTotal: 0 }, context);
    expect(decision).toMatchObject({ resultStatus: "SYNCED", transactionStatus: "COMPLETED", subtotal: 0, total: 0, tax: 0 });
    expect(decision.items).toMatchObject([{ quantity: 2, discount: 10000 }]);
  });

  it("rejects an unavailable cart even when its original payable amount was zero", () => {
    const decision = buildOfflineSyncDecision({ ...payload, items: [{ ...payload.items[0], discount: 10000 }], originalTotal: 0 }, {
      ...context, stockByProductId: new Map([["p1", 0]]),
    });
    expect(decision).toMatchObject({ resultStatus: "FAILED_FINAL", reason: "NO_ITEMS_AVAILABLE", transactionStatus: null, items: [], total: 0 });
    expect(decision.removedItems).toMatchObject([{ productId: "p1", removedQuantity: 2 }]);
  });

  it.each([
    { elapsed: 7 * 24 * 60 * 60 * 1000, status: "SYNCED", reason: "UNCHANGED" },
    { elapsed: 7 * 24 * 60 * 60 * 1000 + 1, status: "PENDING_APPROVAL", reason: "EXPIRED" },
  ])("uses the exact seven-day expiry boundary at $elapsed ms", ({ elapsed, status, reason }) => {
    const decision = buildOfflineSyncDecision({ ...payload, items: [{ ...payload.items[0], discount: 1500 }], originalTotal: 8500 }, {
      ...context, now: new Date(new Date(payload.createdAt).getTime() + elapsed),
    });
    expect(decision).toMatchObject({ resultStatus: status, reason, subtotal: 8500, total: 8500 });
    expect(decision.items[0].discount).toBe(1500);
  });

  it("drops an unavailable discounted row without moving its discount to another product", () => {
    const decision = buildOfflineSyncDecision({ ...payload, items: [
      { ...payload.items[0], discount: 1500 },
      { productId: "p2", name: "Map", price: 1000, quantity: 1, discount: 100 },
    ], originalTotal: 9400, taxRate: 10 }, { ...context, stockByProductId: new Map([["p1", 0], ["p2", 1]]) });
    expect(decision).toMatchObject({ resultStatus: "PENDING_APPROVAL", subtotal: 900, tax: 90, total: 990 });
    expect(decision.items).toEqual([{ productId: "p2", name: "Map", price: 1000, quantity: 1, discount: 100 }]);
  });

  it("does not mutate queued discounts or caller-owned stock during adjustment", () => {
    const queued = { ...payload, items: [{ ...payload.items[0], discount: 7000 }], originalTotal: 3000 };
    const stock = new Map([["p1", 1]]);
    const decision = buildOfflineSyncDecision(queued, { ...context, stockByProductId: stock });
    expect(decision.items[0]).toMatchObject({ quantity: 1, discount: 5000 });
    expect(queued.items[0]).toMatchObject({ quantity: 2, discount: 7000 });
    expect(stock.get("p1")).toBe(1);
  });
});

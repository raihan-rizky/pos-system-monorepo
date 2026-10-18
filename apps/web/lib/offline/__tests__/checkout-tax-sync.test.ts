import { describe, expect, it } from "vitest";
import { buildOfflineSyncDecision } from "../offline-sync-core";

const payload = { clientMutationId: "tax-offline", createdAt: "2026-10-18T03:00:00Z", items: [{ productId: "p1", name: "Produk", price: 5000, quantity: 2 }], discount: 0, originalTotal: 10000 };
const context = { now: new Date("2026-10-18T03:01:00Z"), stockByProductId: new Map([["p1", 10]]) };

describe("offline checkout tax", () => {
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

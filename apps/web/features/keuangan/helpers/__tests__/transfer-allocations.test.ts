import { describe, expect, it } from "vitest";
import { allocateTransfer, type TransferAllocationInput } from "../transfer-allocations";

const input = {
  storeId: "store-1",
  transfer: { id: "transfer-1", storeId: "store-1", date: "2026-11-10", amountCents: 35_000_000, category: "CETAK_PLAT" as const },
  allocations: [
    { paymentId: "payment-1", payableId: "payable-1", storeId: "store-1", paidAt: "2026-11-10", amountCents: 10_000_000, paymentAmountCents: 10_000_000, category: "ATK" as const },
    { paymentId: "payment-2", payableId: "payable-2", storeId: "store-1", paidAt: "2026-11-10", amountCents: 20_000_000, paymentAmountCents: 20_000_000, category: "SPANDUK" as const },
  ],
};

const allocate = (value: unknown) => allocateTransfer(value as TransferAllocationInput);

describe("manual transfer allocation", () => {
  it("places each linked payment in its payable category and the remainder in the transfer category", () => {
    expect(allocate(input)).toEqual({
      totalCents: 35_000_000,
      allocatedCents: 30_000_000,
      unallocatedCents: 5_000_000,
      segments: [
        { paymentId: "payment-1", category: "ATK", amountCents: 10_000_000 },
        { paymentId: "payment-2", category: "SPANDUK", amountCents: 20_000_000 },
        { paymentId: null, category: "CETAK_PLAT", amountCents: 5_000_000 },
      ],
    });
  });

  it("preserves cents and allows legacy categories to remain unselected", () => {
    expect(allocate({ ...input, transfer: { ...input.transfer, amountCents: 101, category: null }, allocations: [
      { ...input.allocations[0], amountCents: 50, paymentAmountCents: 50, category: null },
    ] })).toEqual({ totalCents: 101, allocatedCents: 50, unallocatedCents: 51, segments: [
      { paymentId: "payment-1", category: null, amountCents: 50 },
      { paymentId: null, category: null, amountCents: 51 },
    ] });
  });

  it("rejects allocations above the transfer or the corresponding payment", () => {
    expect(() => allocate({ ...input, transfer: { ...input.transfer, amountCents: 29_999_999 } })).toThrow();
    expect(() => allocate({ ...input, allocations: [{ ...input.allocations[0], amountCents: 10_000_001 }] })).toThrow();
  });

  it("rejects a duplicate payment, another store, or mismatched dates", () => {
    expect(() => allocate({ ...input, allocations: [input.allocations[0], input.allocations[0]] })).toThrow();
    expect(() => allocate({ ...input, allocations: [{ ...input.allocations[0], storeId: "store-2" }] })).toThrow();
    expect(() => allocate({ ...input, allocations: [{ ...input.allocations[0], paidAt: "2026-11-11" }] })).toThrow();
  });

  it("rejects invalid amounts, dates, and report categories", () => {
    expect(() => allocate({ ...input, transfer: { ...input.transfer, amountCents: 1.5 } })).toThrow();
    expect(() => allocate({ ...input, transfer: { ...input.transfer, date: "2026-02-31" }, allocations: [] })).toThrow();
    expect(() => allocate({ ...input, allocations: [{ ...input.allocations[0], category: "OTHER" }] })).toThrow();
  });
});

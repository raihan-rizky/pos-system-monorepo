import { describe, it, expect } from "vitest";
import { snapshotsMatch, stockDelta } from "../snapshots";
import type { ProductSnapshot } from "../snapshots";

function makeSnapshot(overrides: Partial<ProductSnapshot> = {}): ProductSnapshot {
  return {
    id: "p1",
    name: "Test Product",
    sku: "SKU-001",
    price: 15000,
    costPrice: 10000,
    stock: 50,
    minStock: 5,
    unit: "pcs",
    barcode: "123456",
    description: "A test product",
    categoryId: "cat-1",
    storeId: "store-1",
    isActive: true,
    size: "M",
    material: "Cotton",
    imageUrl: "http://example.com/img.jpg",
    ...overrides,
  };
}

describe("snapshotsMatch", () => {
  it("returns true for identical snapshots", () => {
    const snap = makeSnapshot();
    expect(snapshotsMatch(snap, { ...snap })).toBe(true);
  });

  it("returns false when a field differs", () => {
    const snap1 = makeSnapshot();
    const snap2 = makeSnapshot({ stock: 15 });
    expect(snapshotsMatch(snap1, snap2)).toBe(false);
  });

  it("returns false when price differs", () => {
    const snap1 = makeSnapshot();
    const snap2 = makeSnapshot({ price: 99999 });
    expect(snapshotsMatch(snap1, snap2)).toBe(false);
  });
});

describe("stockDelta", () => {
  it("returns positive delta for STOCK_IN", () => {
    expect(stockDelta("IN", 10, 5)).toBe(5);
    expect(stockDelta("IN", 10, -5)).toBe(5); // abs
  });

  it("returns negative delta for STOCK_OUT", () => {
    expect(stockDelta("OUT", 10, 5)).toBe(-5);
    expect(stockDelta("OUT", 10, -5)).toBe(-5); // abs then negate
  });

  it("returns difference from current for ADJUSTMENT", () => {
    expect(stockDelta("ADJUSTMENT", 10, 25)).toBe(15);
    expect(stockDelta("ADJUSTMENT", 25, 10)).toBe(-15);
    expect(stockDelta("ADJUSTMENT", 5, 5)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { resolveReceiptCost } from "../receipt-cost";

describe("resolveReceiptCost", () => {
  it("uses the current product modal as the default and accepts a supplier override", () => {
    expect(resolveReceiptCost({ masterCostPrice: 7000 })).toBe(7000);
    expect(
      resolveReceiptCost({ supplierCostPrice: 6500, masterCostPrice: 7000 }),
    ).toBe(6500);
  });

  it("preserves an explicit zero supplier cost and rounds to cents", () => {
    expect(
      resolveReceiptCost({ supplierCostPrice: 0, masterCostPrice: 7000 }),
    ).toBe(0);
    expect(
      resolveReceiptCost({ supplierCostPrice: 12.345, masterCostPrice: null }),
    ).toBe(12.35);
  });

  it("returns null when neither the supplier nor master has a cost", () => {
    expect(resolveReceiptCost({ masterCostPrice: null })).toBeNull();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 10_000_000_000])(
    "rejects invalid supplier costs (%s)",
    (supplierCostPrice) => {
      expect(() =>
        resolveReceiptCost({ supplierCostPrice, masterCostPrice: 7000 }),
      ).toThrow("Harga modal supplier tidak valid.");
    },
  );
});

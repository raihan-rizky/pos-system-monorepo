import { describe, expect, it } from "vitest";

import { createInboundPricingSnapshot, inboundCostForOrderedUnit } from "../inbound-pricing";
import type { InboundPricingInput, InboundPricingUnit } from "../../types/inventory-management";

const units: InboundPricingUnit[] = [
  { productId: "pcs", unit: "pcs", unitMultiplierToBase: 1, costPrice: 100, price: 150, hargaAgen: 140, hargaDinas: 130 },
  { productId: "box", unit: "box", unitMultiplierToBase: 12, costPrice: 1200, price: 1800, hargaAgen: 1680, hargaDinas: 1560 },
];
const complete: InboundPricingInput = {
  productId: "pcs", costPrice: 100, price: 150, hargaAgen: 140, hargaDinas: 130,
};

describe("inbound pricing snapshot", () => {
  it("records the selected unit, conversion and all supplied prices", () => {
    expect(createInboundPricingSnapshot(complete, units, true, 12)).toEqual({
      version: 1, ...complete, unit: "pcs", unitMultiplierToBase: 1, orderedUnitMultiplierToBase: 12,
    });
  });

  it.each(["productId", "costPrice", "price", "hargaAgen", "hargaDinas"] as const)(
    "requires %s when the receipt matches",
    (field) => {
      expect(() => createInboundPricingSnapshot({ ...complete, [field]: null }, units, true, 12)).toThrow();
    },
  );

  it("accepts zero for every price", () => {
    const zero = { productId: "box", costPrice: 0, price: 0, hargaAgen: 0, hargaDinas: 0 };
    expect(createInboundPricingSnapshot(zero, units, true, 12)).toMatchObject(zero);
  });

  it("allows absent or partial pricing for mismatched lines", () => {
    expect(createInboundPricingSnapshot(undefined, units, false, 12)).toMatchObject({
      productId: null, unit: null, costPrice: null, price: null, hargaAgen: null, hargaDinas: null,
    });
    expect(createInboundPricingSnapshot({ ...complete, price: null }, units, false, 12)).toMatchObject({
      productId: "pcs", costPrice: 100, price: null,
    });
  });

  it("rejects a unit outside the product's selectable units and prices without a unit", () => {
    expect(() => createInboundPricingSnapshot({ ...complete, productId: "other" }, units, true, 12)).toThrow(/Satuan harga/);
    expect(() => createInboundPricingSnapshot({ ...complete, productId: null }, units, false, 12)).toThrow(/Pilih satuan/);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 10_000_000_000, 1.001])(
    "rejects invalid price %s for each price field, even on mismatched lines",
    (invalid) => {
      for (const field of ["costPrice", "price", "hargaAgen", "hargaDinas"] as const) {
        expect(() => createInboundPricingSnapshot({ ...complete, [field]: invalid }, units, false, 12)).toThrow(/Harga harus/);
      }
    },
  );

  it("accepts the maximum supported two-decimal price", () => {
    expect(createInboundPricingSnapshot({ ...complete, price: 9_999_999_999.99 }, units, true, 12).price).toBe(9_999_999_999.99);
  });
});

describe("inbound cost in the ordered unit", () => {
  it("converts in both directions using the selected and ordered multipliers", () => {
    const perPiece = createInboundPricingSnapshot(complete, units, true, 12);
    const perBox = createInboundPricingSnapshot({ ...complete, productId: "box", costPrice: 1200 }, units, true, 1);
    expect(inboundCostForOrderedUnit(perPiece, 12)).toBe(1200);
    expect(inboundCostForOrderedUnit(perBox, 1)).toBe(100);
  });

  it("rounds a fractional conversion to two decimal places", () => {
    const snapshot = { ...createInboundPricingSnapshot(complete, units, true, 1), unitMultiplierToBase: 3 };
    expect(inboundCostForOrderedUnit(snapshot, 1)).toBe(33.33);
  });

  it("does not fabricate a cost for an optional empty snapshot", () => {
    expect(inboundCostForOrderedUnit(createInboundPricingSnapshot(undefined, units, false, 1), 1)).toBeNull();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects an invalid ordered multiplier %s", (multiplier) => {
    expect(() => inboundCostForOrderedUnit(createInboundPricingSnapshot(complete, units, true, 1), multiplier)).toThrow(/Konversi/);
  });

  it("rejects an invalid selected multiplier and a converted cost beyond the limit", () => {
    const snapshot = createInboundPricingSnapshot(complete, units, true, 1);
    expect(() => inboundCostForOrderedUnit({ ...snapshot, unitMultiplierToBase: 0 }, 1)).toThrow(/Konversi/);
    expect(() => inboundCostForOrderedUnit({ ...snapshot, costPrice: 9_999_999_999.99 }, 2)).toThrow(/melampaui|melebihi/);
  });
});

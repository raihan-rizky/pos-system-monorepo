import { describe, expect, it } from "vitest";
import { buildInternalUseRecap } from "../internal-use-recap";
import { resolveInternalUsePeriodRange } from "../period";

describe("internal use recap helpers", () => {
  it("uses Monday through Sunday for weekly Jakarta ranges", () => {
    const range = resolveInternalUsePeriodRange("weekly", "2026-06-05");

    expect(range?.range.start).toBe("2026-06-01");
    expect(range?.range.end).toBe("2026-06-07");
  });

  it("aggregates approved internal usage rows by product and unit", () => {
    const recap = buildInternalUseRecap({
      period: "weekly",
      anchorDate: "2026-06-05",
      rows: [
        {
          id: "log-1",
          productId: "product-1",
          quantity: 2,
          unitCost: "10000",
          note: "Display sample",
          person: "Admin",
          createdAt: new Date("2026-06-03T03:00:00.000Z"),
          product: { id: "product-1", name: "Banner Flexi", sku: "BNR", unit: "meter" },
        },
        {
          id: "log-2",
          productId: "product-1",
          quantity: 3,
          unitCost: "10000",
          note: null,
          person: "Admin",
          createdAt: new Date("2026-06-04T03:00:00.000Z"),
          product: { id: "product-1", name: "Banner Flexi", sku: "BNR", unit: "meter" },
        },
        {
          id: "log-3",
          productId: "product-2",
          quantity: 1,
          unitCost: null,
          note: "Office use",
          person: null,
          createdAt: new Date("2026-06-04T04:00:00.000Z"),
          product: { id: "product-2", name: "Tinta", sku: "INK", unit: "botol" },
        },
      ],
    });

    expect(recap.summary).toEqual({
      entryCount: 3,
      productCount: 2,
      unitGroupCount: 2,
      totalQuantity: 6,
      totalValue: 50000,
      missingUnitCostCount: 1,
      hasIncompleteValue: true,
    });
    expect(recap.products[0]).toEqual(
      expect.objectContaining({
        productId: "product-1",
        quantity: 5,
        value: 50000,
        entryCount: 2,
      }),
    );
  });
});

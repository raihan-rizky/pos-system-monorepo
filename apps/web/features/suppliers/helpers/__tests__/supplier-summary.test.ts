import { describe, expect, it } from "vitest";

import { buildSupplierSummary } from "../supplier-summary";

describe("supplier summary aggregation", () => {
  it("aggregates purchase value and quantity by supplier id", () => {
    const summary = buildSupplierSummary([
      restockLog("log-1", "supplier-1", "CV Sinar Jaya", "product-1", 3, 1000),
      restockLog("log-2", "supplier-1", "CV Sinar Jaya", "product-2", 2, 500),
      restockLog("log-3", "supplier-2", "PT Kertas", "product-3", 4, 250),
    ]);

    expect(summary.totalPurchaseValue).toBe(5000);
    expect(summary.totalRestockQuantity).toBe(9);
    expect(summary.activeSupplierCount).toBe(2);
    expect(summary.topSupplier?.supplierId).toBe("supplier-1");
    expect(summary.suppliers[0]).toEqual(
      expect.objectContaining({
        supplierId: "supplier-1",
        supplierName: "CV Sinar Jaya",
        purchaseValue: 4000,
        restockQuantity: 5,
        restockCount: 2,
      }),
    );
  });

  it("excludes missing-cost lines from purchase value and reports the count", () => {
    const summary = buildSupplierSummary([
      restockLog("log-1", "supplier-1", "CV Sinar Jaya", "product-1", 3, null),
      restockLog("log-2", "supplier-1", "CV Sinar Jaya", "product-2", 2, 500),
    ]);

    expect(summary.totalPurchaseValue).toBe(1000);
    expect(summary.totalRestockQuantity).toBe(5);
    expect(summary.missingCostCount).toBe(1);
  });
});

function restockLog(
  id: string,
  supplierId: string,
  supplierName: string,
  productId: string,
  quantity: number,
  unitCost: number | null,
) {
  return {
    id,
    supplierId,
    supplier: { id: supplierId, name: supplierName, type: "DISTRIBUTOR" },
    productId,
    product: { id: productId, name: productId, unit: "pcs" },
    quantity,
    unitCost,
    createdAt: new Date("2026-06-06T00:00:00.000Z"),
  };
}

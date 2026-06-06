import { describe, expect, it } from "vitest";

import {
  buildSupplierStockInRecapBundles,
  type SupplierStockInRecapLog,
} from "../supplier-stock-in-recap";

describe("supplier stock-in recap bundle grouping", () => {
  it("groups bulk logs by batch and keeps rejected lines out of approved totals", () => {
    const bundles = buildSupplierStockInRecapBundles(
      [
        restockLog({
          id: "log-approved",
          productId: "product-1",
          quantity: 3,
          unitCost: 1000,
          status: "APPROVED",
        }),
        restockLog({
          id: "log-rejected",
          productId: "product-2",
          quantity: 2,
          unitCost: 500,
          status: "REJECTED",
          rejectionReason: "Harga tidak sesuai",
        }),
      ],
      [
        batchItem("log-approved", "batch-1"),
        batchItem("log-rejected", "batch-1"),
      ],
    );

    expect(bundles).toHaveLength(1);
    expect(bundles[0]).toMatchObject({
      id: "batch-1",
      kind: "BULK_BATCH",
      batchOperationId: "batch-1",
      note: "Restock mingguan",
      summary: {
        itemCount: 2,
        approvedItemCount: 1,
        rejectedItemCount: 1,
        approvedQuantity: 3,
        approvedTotalCost: 3000,
        hasPartialCost: false,
        missingCostCount: 0,
      },
    });
    expect(bundles[0].items[1]).toMatchObject({
      id: "log-rejected",
      status: "REJECTED",
      rejectionReason: "Harga tidak sesuai",
      lineTotalCost: 1000,
    });
  });

  it("creates manual bundles for approved restocks without batch metadata", () => {
    const bundles = buildSupplierStockInRecapBundles(
      [
        restockLog({
          id: "manual-log",
          productId: "product-1",
          quantity: 4,
          unitCost: null,
          status: "APPROVED",
        }),
      ],
      [],
    );

    expect(bundles).toEqual([
      expect.objectContaining({
        id: "manual:manual-log",
        kind: "MANUAL_RESTOCK",
        batchOperationId: null,
        summary: expect.objectContaining({
          approvedQuantity: 4,
          approvedTotalCost: 0,
          hasPartialCost: true,
          missingCostCount: 1,
        }),
      }),
    ]);
  });

  it("hides rejected-only bundles from the stock-in recap", () => {
    const bundles = buildSupplierStockInRecapBundles(
      [
        restockLog({
          id: "rejected-only",
          productId: "product-1",
          quantity: 4,
          unitCost: 1000,
          status: "REJECTED",
        }),
      ],
      [batchItem("rejected-only", "batch-rejected")],
    );

    expect(bundles).toEqual([]);
  });
});

function restockLog(
  overrides: Partial<SupplierStockInRecapLog>,
): SupplierStockInRecapLog {
  const productId = overrides.productId ?? "product-1";
  return {
    id: overrides.id ?? "log-1",
    supplierId: "supplier-1",
    supplier: { id: "supplier-1", name: "CV Sinar Jaya", type: "DISTRIBUTOR" },
    productId,
    product: {
      id: productId,
      name: productId,
      sku: `SKU-${productId}`,
      unit: "pcs",
      category: { id: "category-1", name: "ATK" },
    },
    quantity: overrides.quantity ?? 1,
    unitCost: "unitCost" in overrides ? overrides.unitCost! : 1000,
    note: overrides.note ?? "Restock supplier",
    person: overrides.person ?? "Admin",
    approverName: overrides.approverName ?? "Owner",
    status: overrides.status ?? "APPROVED",
    rejectionReason: overrides.rejectionReason ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-06-06T08:00:00.000Z"),
    decidedAt: overrides.decidedAt ?? new Date("2026-06-06T09:00:00.000Z"),
  };
}

function batchItem(inventoryLogId: string, batchOperationId: string) {
  return {
    inventoryLogId,
    batchOperation: {
      id: batchOperationId,
      createdAt: new Date("2026-06-06T07:00:00.000Z"),
      summary: { note: "Restock mingguan" },
    },
  };
}

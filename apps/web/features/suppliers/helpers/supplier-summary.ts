export type SupplierRestockLog = {
  id: string;
  supplierId: string | null;
  supplier: {
    id: string;
    name: string;
    type: string;
  } | null;
  productId: string;
  product: {
    id: string;
    name: string;
    unit: string;
  };
  quantity: number;
  unitCost: number | { toString: () => string } | null;
  createdAt: Date;
};

export type SupplierSummaryRow = {
  supplierId: string;
  supplierName: string;
  supplierType: string;
  purchaseValue: number;
  restockQuantity: number;
  restockCount: number;
  missingCostCount: number;
  lastStockInAt: string | null;
  topProductName: string | null;
};

export type SupplierSummary = {
  totalPurchaseValue: number;
  totalRestockQuantity: number;
  activeSupplierCount: number;
  missingCostCount: number;
  topSupplier: SupplierSummaryRow | null;
  suppliers: SupplierSummaryRow[];
};

type MutableSummaryRow = SupplierSummaryRow & {
  productQuantities: Map<string, { productName: string; quantity: number }>;
};

export function buildSupplierSummary(
  logs: SupplierRestockLog[],
): SupplierSummary {
  const rows = new Map<string, MutableSummaryRow>();

  for (const log of logs) {
    if (!log.supplierId || !log.supplier) continue;

    const current =
      rows.get(log.supplierId) ??
      ({
        supplierId: log.supplierId,
        supplierName: log.supplier.name,
        supplierType: log.supplier.type,
        purchaseValue: 0,
        restockQuantity: 0,
        restockCount: 0,
        missingCostCount: 0,
        lastStockInAt: null,
        topProductName: null,
        productQuantities: new Map(),
      } satisfies MutableSummaryRow);

    const unitCost = toNumberOrNull(log.unitCost);
    if (unitCost === null) {
      current.missingCostCount += 1;
    } else {
      current.purchaseValue += unitCost * log.quantity;
    }

    current.restockQuantity += log.quantity;
    current.restockCount += 1;
    const isoCreatedAt = log.createdAt.toISOString();
    if (!current.lastStockInAt || isoCreatedAt > current.lastStockInAt) {
      current.lastStockInAt = isoCreatedAt;
    }

    const productBucket = current.productQuantities.get(log.productId) ?? {
      productName: log.product.name,
      quantity: 0,
    };
    productBucket.quantity += log.quantity;
    current.productQuantities.set(log.productId, productBucket);

    rows.set(log.supplierId, current);
  }

  const suppliers = Array.from(rows.values())
    .map(({ productQuantities, ...row }) => ({
      ...row,
      topProductName:
        Array.from(productQuantities.values()).sort(
          (left, right) => right.quantity - left.quantity,
        )[0]?.productName ?? null,
    }))
    .sort((left, right) => right.purchaseValue - left.purchaseValue);

  return {
    totalPurchaseValue: suppliers.reduce(
      (sum, row) => sum + row.purchaseValue,
      0,
    ),
    totalRestockQuantity: suppliers.reduce(
      (sum, row) => sum + row.restockQuantity,
      0,
    ),
    activeSupplierCount: suppliers.length,
    missingCostCount: suppliers.reduce(
      (sum, row) => sum + row.missingCostCount,
      0,
    ),
    topSupplier: suppliers[0] ?? null,
    suppliers,
  };
}

function toNumberOrNull(value: SupplierRestockLog["unitCost"]): number | null {
  if (value === null) return null;
  const numberValue =
    typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(numberValue) ? numberValue : null;
}

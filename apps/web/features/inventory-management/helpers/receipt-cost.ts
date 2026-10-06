const MAX_RECEIPT_COST = 9_999_999_999.99;

export function resolveReceiptCost(input: {
  supplierCostPrice?: number | null;
  masterCostPrice: number | null;
}): number | null {
  const value = input.supplierCostPrice ?? input.masterCostPrice;

  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > MAX_RECEIPT_COST) {
    throw new Error("Harga modal supplier tidak valid.");
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED =
  "PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED";

export const PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED_MESSAGE =
  "Mayoritas Harga Jual lebih rendah daripada HPP. Periksa kembali mapping kolom Harga Jual dan HPP sebelum melanjutkan import.";

const MINIMUM_COMPARABLE_ROW_COUNT = 10;
const SUSPICIOUS_PRICE_BELOW_COST_RATIO = 0.8;

type PriceComparisonRow = {
  price: number;
  costPrice?: number | null;
};

export type ProductImportPriceColumnAnalysis = {
  comparableRowCount: number;
  priceBelowCostRowCount: number;
  suspectedSwapped: boolean;
};

export function analyzeProductImportPriceColumns(
  rows: PriceComparisonRow[],
): ProductImportPriceColumnAnalysis {
  const comparableRows = rows.filter(
    (row) =>
      Number.isFinite(row.price) &&
      row.price > 0 &&
      row.costPrice != null &&
      Number.isFinite(row.costPrice) &&
      row.costPrice > 0,
  );
  const priceBelowCostRowCount = comparableRows.filter(
    (row) => row.price < Number(row.costPrice),
  ).length;
  const comparableRowCount = comparableRows.length;

  return {
    comparableRowCount,
    priceBelowCostRowCount,
    suspectedSwapped:
      comparableRowCount >= MINIMUM_COMPARABLE_ROW_COUNT &&
      priceBelowCostRowCount / comparableRowCount >= SUSPICIOUS_PRICE_BELOW_COST_RATIO,
  };
}

export function assertProductImportPriceColumnsNotSwapped(rows: PriceComparisonRow[]) {
  const analysis = analyzeProductImportPriceColumns(rows);
  if (!analysis.suspectedSwapped) return;

  throw new Error(
    `${PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED}:${analysis.priceBelowCostRowCount}:${analysis.comparableRowCount}`,
  );
}

export interface ProductImportResultCounts {
  createdProductCount: number;
  variantProductCount?: number;
  updatedProductCount: number;
  skippedRowCount: number;
  conversionReviewCount?: number;
  createdCategoryCount: number;
  inventoryLogCount: number;
}

export function buildProductImportResultSummary(result: ProductImportResultCounts) {
  return [
    { label: "Dibuat", value: result.createdProductCount },
    { label: "Varian", value: result.variantProductCount ?? 0 },
    { label: "Update Harga", value: result.updatedProductCount },
    { label: "Dilewati", value: result.skippedRowCount },
    { label: "Review Unit", value: result.conversionReviewCount ?? 0 },
    { label: "Kategori", value: result.createdCategoryCount },
    { label: "Stock Logs", value: result.inventoryLogCount },
  ];
}

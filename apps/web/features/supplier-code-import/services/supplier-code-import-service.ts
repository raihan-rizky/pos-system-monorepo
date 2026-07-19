import type { SupplierCodeImportCommitRow } from "../types";

export interface SupplierCodeImportRepository {
  replaceAssignments(
    assignments: Array<{ productId: string; supplierIds: string[] }>,
  ): Promise<void>;
}

export async function commitSupplierCodeImport(
  repository: SupplierCodeImportRepository,
  rows: SupplierCodeImportCommitRow[],
) {
  const productIds = new Set<string>();
  const invalid =
    rows.length === 0 ||
    rows.some((row) => {
      const supplierIds = new Set(row.supplierIds);
      const duplicateProduct = productIds.has(row.productId);
      productIds.add(row.productId);
      return (
        !row.productId ||
        row.supplierIds.length === 0 ||
        supplierIds.size !== row.supplierIds.length ||
        row.supplierCodes.length !== row.supplierIds.length ||
        duplicateProduct
      );
    });

  if (invalid) throw new Error("Data impor kode supplier tidak valid.");

  const assignments = rows.map((row) => ({
    productId: row.productId,
    supplierIds: row.supplierIds,
  }));
  await repository.replaceAssignments(assignments);

  return {
    updatedProducts: rows.length,
    linkedSuppliers: rows.reduce((total, row) => total + row.supplierIds.length, 0),
  };
}

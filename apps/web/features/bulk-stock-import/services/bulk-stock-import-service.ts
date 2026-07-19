import {
  buildBulkStockImportImpacts,
  normalizeBulkStockImportRows,
  type BulkStockImportMode,
} from "../helpers/import-core";
import type {
  BulkStockImportRepository,
  BulkStockImportUser,
} from "../repositories/BulkStockImportRepository";

export interface BulkStockImportCommitRowInput {
  rowNumber: number;
  name: string;
  category: string;
  unit: string;
  stock: number;
  selectedProductId?: string;
}

export interface CommitBulkStockImportInput {
  user: BulkStockImportUser;
  mode: BulkStockImportMode;
  rows: BulkStockImportCommitRowInput[];
  supplierId?: string;
  note?: string;
  allowNegativeStock?: boolean;
}

export interface PreviewBulkStockImportInput {
  storeId: string;
  records: Array<Record<string, unknown>>;
}

const DEFAULT_STORE_ID = "store-main";
const DEFAULT_IMPORT_NOTE = "Impor stok massal";

export async function previewBulkStockImport(
  repository: BulkStockImportRepository,
  input: PreviewBulkStockImportInput,
) {
  const products = await repository.findActiveProductsForStockImport(input.storeId);
  return normalizeBulkStockImportRows(input.records, products);
}

export async function commitBulkStockImport(
  repository: BulkStockImportRepository,
  input: CommitBulkStockImportInput,
) {
  const storeId = input.user.storeId || DEFAULT_STORE_ID;
  const products = await repository.findActiveProductsForStockImport(storeId);
  const normalized = normalizeBulkStockImportRows(
    input.rows.map((row) => ({ ...row })),
    products,
  );
  const blockingRows = normalized.rows.filter((row) => row.status === "error");
  if (blockingRows.length > 0) {
    throw new BulkStockImportValidationError("Import has invalid rows");
  }

  const impacts = buildBulkStockImportImpacts(normalized.rows, products, input.mode);
  if (impacts.length === 0) {
    throw new BulkStockImportValidationError("No matched rows to commit");
  }
  if (
    input.mode === "ADD" &&
    input.allowNegativeStock !== true &&
    normalized.rows.some((row) => row.status === "valid" && row.stock < 0)
  ) {
    throw new BulkStockImportValidationError(
      "Add stock import cannot contain negative quantities",
    );
  }

  const supplier = input.supplierId
    ? await repository.findActiveSupplierById(input.supplierId)
    : null;
  if (input.supplierId && !supplier) {
    throw new BulkStockImportValidationError("Supplier was not found");
  }

  return repository.commitStockImport({
    storeId,
    user: input.user,
    mode: input.mode,
    impacts,
    supplier,
    note: input.note?.trim() || DEFAULT_IMPORT_NOTE,
    allowNegativeStock: input.allowNegativeStock === true,
  });
}

export class BulkStockImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulkStockImportValidationError";
  }
}

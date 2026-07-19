export interface SupplierCodeImportRow {
  rowNumber: number;
  sku: string;
  productId?: string;
  productName?: string;
  supplierCodes: string[];
  supplierIds: string[];
  supplierNames: string[];
  errors: string[];
}

export interface SupplierCodeImportPreview {
  rows: SupplierCodeImportRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

export interface SupplierCodeImportCommitRow {
  rowNumber: number;
  sku: string;
  productId: string;
  supplierCodes: string[];
  supplierIds: string[];
}

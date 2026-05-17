export const REQUIRED_IMPORT_COLUMNS = ["name", "sku", "category", "price", "stock", "unit"] as const;

export const OPTIONAL_IMPORT_COLUMNS = [
  "costPrice",
  "minStock",
  "barcode",
  "description",
  "size",
  "material",
  "imageUrl",
] as const;

export const IMPORT_COLUMNS = [...REQUIRED_IMPORT_COLUMNS, ...OPTIONAL_IMPORT_COLUMNS] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export type ImportRowDecision = "create" | "update" | "skip";
export type PreviewFilter = "all" | "ready" | "errors" | "warnings" | "duplicate" | "new-category";

export interface ColumnMapping {
  [rawHeader: string]: ImportColumn | "";
}

export interface NormalizedImportRow {
  rowNumber: number;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  unit: string;
  costPrice?: number | null;
  minStock?: number;
  barcode?: string | null;
  description?: string | null;
  size?: string | null;
  material?: string | null;
  imageUrl?: string | null;
  duplicateInFile: boolean;
  existingProductId?: string;
  existingProductName?: string;
  missingCategory: boolean;
  warnings: string[];
  errors: string[];
}

export interface ImportPreviewResponse {
  rows: NormalizedImportRow[];
  missingColumns: string[];
  unknownColumns: string[];
  warnings: string[];
  errors: string[];
  existingSkuMatches: Array<{ sku: string; productId: string; name: string }>;
  missingCategories: string[];
  requiredColumns: readonly string[];
  suggestions: Record<string, string>;
}

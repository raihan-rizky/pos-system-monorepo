export const REQUIRED_IMPORT_COLUMNS = ["name", "sku", "category", "price", "unit"] as const;

export const OPTIONAL_IMPORT_COLUMNS = [
  "stock",
  "costPrice",
  "hargaDinas",
  "minStock",
  "unitMultiplierToBase",
  "barcode",
  "description",
  "size",
  "material",
  "imageUrl",
] as const;

export const IMPORT_COLUMNS = [...REQUIRED_IMPORT_COLUMNS, ...OPTIONAL_IMPORT_COLUMNS] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export type ImportRowDecision = "create" | "update" | "skip" | "create-variant";
export type ImportAutoAction =
  | "create"
  | "auto_skip"
  | "auto_price_update"
  | "auto_create_variant"
  | "conflict"
  | "same_unit_price_conflict";
export type PreviewFilter = "all" | "ready" | "errors" | "warnings" | "duplicate" | "new-category" | "unresolved";
export type ImportCleaningStatus = "clean" | "auto_fixed" | "review_required" | "warning";

export interface ImportCleaningFix {
  ruleId: string;
  field: "price" | "costPrice" | "hargaDinas";
  oldValue: number | null;
  newValue: number | null;
}

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
  stockProvided?: boolean;
  unit: string;
  unitMultiplierToBase?: number | null;
  costPrice?: number | null;
  hargaDinas?: number | null;
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
  autoAction?: ImportAutoAction;
  autoActionReason?: string;
  matchedProductId?: string;
  matchedProductSku?: string;
  matchedStockGroupId?: string | null;
  generatedSku?: string;
  conversionNeedsReview?: boolean;
  stockIgnoredForVariant?: boolean;
  normalizedProductKey?: string;
  sourceFamilyKey?: string;
  cleaningStatus?: ImportCleaningStatus;
  cleaningIssues?: string[];
  cleaningFixes?: ImportCleaningFix[];
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
  source?: string;
  imageCount?: number;
}

export type ImportMethod = "file" | "image";
export type ImportStep = "method" | "upload" | "image-upload" | "mapping" | "preview" | "result";

export type ExtractionSource = "easyocr" | "nebius-vision";

export interface FieldConfidence {
  name: number;   // 0.0 - 1.0
  price: number;
  sku: number;
}

export interface ExtractedProduct {
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  unit: string;
  costPrice?: number | null;
  description?: string | null;
  size?: string | null;
  material?: string | null;
  confidence: FieldConfidence;
}

export interface ImageExtractResponse {
  rows: NormalizedImportRow[];
  extractedProducts: ExtractedProduct[];
  source: ExtractionSource;
  warnings: string[];
  errors: string[];
  existingSkuMatches: Array<{ sku: string; productId: string; name: string }>;
  missingCategories: string[];
  imageCount: number;
  processingTimeMs: number;
}

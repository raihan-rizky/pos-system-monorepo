import * as XLSX from "xlsx";
import { z } from "zod";
import {
  IMPORT_COLUMNS,
  REQUIRED_IMPORT_COLUMNS,
  type ColumnMapping,
  type ImportPreviewResponse,
  type NormalizedImportRow,
} from "../types";

export const MAX_PRODUCT_IMPORT_ROWS = 3000;

const HEADER_ALIASES: Record<string, string> = {
  productname: "name",
  product_name: "name",
  nama: "name",
  namaproduk: "name",
  kode: "sku",
  code: "sku",
  kategori: "category",
  harga: "price",
  stok: "stock",
  satuan: "unit",
  unit_multiplier_to_base: "unitMultiplierToBase",
  unitmultiplier: "unitMultiplierToBase",
  multiplier: "unitMultiplierToBase",
  hpp: "costPrice",
  cost: "costPrice",
  costprice: "costPrice",
  cost_price: "costPrice",
  min_stock: "minStock",
  minimumstock: "minStock",
  gambar: "imageUrl",
  image: "imageUrl",
};

export { HEADER_ALIASES };

export const importRowCommitSchema = z.object({
  rowNumber: z.number().int().min(1),
  name: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  category: z.string().trim().min(1),
  price: z.coerce.number(),
  stock: z.coerce.number(),
  unit: z.string().trim().min(1),
  unitMultiplierToBase: z.coerce.number().min(0).optional().nullable(),
  costPrice: z.coerce.number().min(0).optional().nullable(),
  minStock: z.coerce.number().int().min(0).optional(),
  barcode: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  size: z.string().trim().optional().nullable(),
  material: z.string().trim().optional().nullable(),
  imageUrl: z.string().trim().optional().nullable(),
});

export type ImportCommitRow = z.infer<typeof importRowCommitSchema>;

export function normalizeHeader(value: unknown) {
  const raw = String(value ?? "").trim();
  const compact = raw.replace(/[\s-]+/g, "_");
  const key = compact.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return HEADER_ALIASES[key] ?? key;
}

function normalizeValue(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  const cleaned = normalizeValue(value).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return Number.NaN;
  return Number(cleaned);
}

function parseWorkbookRows(buffer: ArrayBuffer, columnMapping?: ColumnMapping) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { headers: [] as string[], records: [] as Record<string, unknown>[] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  const rawHeaders = (matrix[0] ?? []).map((h) => String(h ?? "").trim()).filter(Boolean);

  // Apply column mapping if provided; otherwise auto-normalize via aliases
  const normalizedHeaders = rawHeaders.map((raw) => {
    if (columnMapping && raw in columnMapping) {
      return columnMapping[raw] || ""; // "" means unmapped/ignored
    }
    return normalizeHeader(raw);
  });

  const records = matrix.slice(1).filter((row) => row.some((cell) => normalizeValue(cell))).map((row) => {
    const record: Record<string, unknown> = {};
    normalizedHeaders.forEach((header, index) => {
      if (header) record[header] = row[index];
    });
    return record;
  });
  return { headers: normalizedHeaders.filter(Boolean), records };
}

/**
 * Extract raw (unmapped) headers from a file buffer — used client-side for the
 * column-mapping step.
 */
export function extractRawHeaders(buffer: ArrayBuffer): string[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  return (matrix[0] ?? []).map((h) => String(h ?? "").trim()).filter(Boolean);
}

export function parseImportFile(buffer: ArrayBuffer, columnMapping?: ColumnMapping) {
  return parseWorkbookRows(buffer, columnMapping);
}

export function buildMissingColumnResponse(headers: string[]) {
  const knownColumns = new Set<string>(IMPORT_COLUMNS);
  const headerSet = new Set(headers);
  const missingColumns = REQUIRED_IMPORT_COLUMNS.filter((column) => !headerSet.has(column));
  const unknownColumns = headers.filter((column) => !knownColumns.has(column));

  // Build suggestions for common misspellings
  const suggestions: Record<string, string> = {};
  for (const col of unknownColumns) {
    const normalized = normalizeHeader(col);
    if (knownColumns.has(normalized)) {
      suggestions[col] = normalized;
    }
  }

  return { missingColumns, unknownColumns, suggestions };
}

export function normalizeImportRows(
  records: Record<string, unknown>[],
  existingSkuMap: Map<string, { id: string; name: string }>,
  existingCategoryNames: Set<string>,
): Pick<ImportPreviewResponse, "rows" | "warnings" | "errors" | "existingSkuMatches" | "missingCategories"> {
  const skuCounts = new Map<string, number>();
  records.forEach((record) => {
    const sku = normalizeValue(record.sku);
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
  });

  const missingCategories = new Set<string>();
  const existingSkuMatches = new Map<string, { sku: string; productId: string; name: string }>();
  const warnings: string[] = [];
  const errors: string[] = [];

  const rows: NormalizedImportRow[] = records.slice(0, MAX_PRODUCT_IMPORT_ROWS).map((record, index) => {
    const rowErrors: string[] = [];
    const rowWarnings: string[] = [];
    const rowNumber = index + 2;
    const sku = normalizeValue(record.sku);
    const category = normalizeValue(record.category);
    const price = toNumber(record.price);
    const stock = toNumber(record.stock);
    const minStockRaw = normalizeValue(record.minStock);
    const costPriceRaw = normalizeValue(record.costPrice);
    const unitMultiplierRaw = normalizeValue(record.unitMultiplierToBase);
    const minStock = minStockRaw ? toNumber(record.minStock) : 5;
    const costPrice = costPriceRaw ? toNumber(record.costPrice) : Number.NaN;
    const unitMultiplierToBase = unitMultiplierRaw ? toNumber(record.unitMultiplierToBase) : Number.NaN;

    if (!normalizeValue(record.name)) rowErrors.push("Name is required.");
    if (!sku) rowErrors.push("SKU is required.");
    if (!category) rowErrors.push("Category is required.");
    if (!Number.isFinite(price)) {
      rowWarnings.push("Price was not a valid number and will be imported as 0.");
    }
    if (!normalizeValue(record.unit)) rowErrors.push("Unit is required.");
    if (Number.isFinite(stock) && stock < 0) {
      rowWarnings.push("This stock is not supposed to be negative.");
    }
    if (costPriceRaw && (!Number.isFinite(costPrice) || costPrice < 0)) {
      rowWarnings.push("Cost price was not a valid number and will be imported as empty.");
    }
    if (minStockRaw && (!Number.isFinite(minStock) || minStock < 0)) {
      rowWarnings.push("Min stock was not a valid number and will be imported as 5.");
    }
    if (unitMultiplierRaw && (!Number.isFinite(unitMultiplierToBase) || unitMultiplierToBase <= 0)) {
      rowWarnings.push("Unit multiplier was not a valid positive number and will be guessed or reviewed.");
    }

    const duplicateInFile = sku ? (skuCounts.get(sku) ?? 0) > 1 : false;
    if (duplicateInFile) rowWarnings.push("Duplicate SKU in file.");

    const existingProduct = sku ? existingSkuMap.get(sku) : undefined;
    if (existingProduct) {
      rowWarnings.push("SKU already exists. Choose update or skip before commit.");
      existingSkuMatches.set(sku, { sku, productId: existingProduct.id, name: existingProduct.name });
    }

    const missingCategory = Boolean(category && !existingCategoryNames.has(category.toLowerCase()));
    if (missingCategory) {
      rowWarnings.push("Category will be created on commit.");
      missingCategories.add(category);
    }

    rowWarnings.forEach((warning) => warnings.push(`Row ${rowNumber}: ${warning}`));
    rowErrors.forEach((error) => errors.push(`Row ${rowNumber}: ${error}`));

    return {
      rowNumber,
      name: normalizeValue(record.name),
      sku,
      category,
      price: Number.isFinite(price) ? price : 0,
      stock: Number.isFinite(stock) ? stock : 0,
      unit: normalizeValue(record.unit),
      unitMultiplierToBase:
        unitMultiplierRaw && Number.isFinite(unitMultiplierToBase) && unitMultiplierToBase > 0
          ? unitMultiplierToBase
          : null,
      costPrice: costPriceRaw && Number.isFinite(costPrice) && costPrice >= 0 ? costPrice : null,
      minStock: minStockRaw && Number.isFinite(minStock) && minStock >= 0 ? Math.trunc(minStock) : 5,
      barcode: normalizeValue(record.barcode) || null,
      description: normalizeValue(record.description) || null,
      size: normalizeValue(record.size) || null,
      material: normalizeValue(record.material) || null,
      imageUrl: normalizeValue(record.imageUrl) || null,
      duplicateInFile,
      existingProductId: existingProduct?.id,
      existingProductName: existingProduct?.name,
      missingCategory,
      warnings: rowWarnings,
      errors: rowErrors,
    };
  });

  if (records.length > MAX_PRODUCT_IMPORT_ROWS) {
    errors.push(`Import files are limited to ${MAX_PRODUCT_IMPORT_ROWS} rows.`);
  }

  return {
    rows,
    warnings,
    errors,
    existingSkuMatches: Array.from(existingSkuMatches.values()),
    missingCategories: Array.from(missingCategories),
  };
}

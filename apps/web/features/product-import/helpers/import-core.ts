import { z } from "zod";
import {
  IMPORT_COLUMNS,
  REQUIRED_IMPORT_COLUMNS,
  type ImportPreviewResponse,
  type ImportCleaningFix,
  type NormalizedImportRow,
} from "../types";
import { normalizeSupplierCode } from "@/features/suppliers/helpers/supplier-code";

export const MAX_PRODUCT_IMPORT_ROWS = 3000;

const HEADER_ALIASES: Record<string, string> = {
  productname: "name",
  product_name: "name",
  nama: "name",
  namaproduk: "name",
  nama_item: "name",
  namaitem: "name",
  kode: "sku",
  code: "sku",
  kode_item: "sku",
  kodeitem: "sku",
  kategori: "category",
  harga: "price",
  harga_level_1: "price",
  hargalevel1: "price",
  hargadinas: "hargaDinas",
  harga_dinas: "hargaDinas",
  hargapemerintah: "hargaDinas",
  harga_pemerintah: "hargaDinas",
  harga_level_2: "hargaDinas",
  hargalevel2: "hargaDinas",
  hargaagen: "hargaAgen",
  harga_agen: "hargaAgen",
  hargaagent: "hargaAgen",
  harga_agent: "hargaAgen",
  harga_level_3: "hargaAgen",
  hargalevel3: "hargaAgen",
  stok: "stock",
  satuan: "unit",
  konversi: "unitMultiplierToBase",
  unit_multiplier_to_base: "unitMultiplierToBase",
  unitmultiplier: "unitMultiplierToBase",
  multiplier: "unitMultiplierToBase",
  hpp: "costPrice",
  harga_pokok: "costPrice",
  hargapokok: "costPrice",
  cost: "costPrice",
  costprice: "costPrice",
  cost_price: "costPrice",
  min_stock: "minStock",
  minimumstock: "minStock",
  gambar: "imageUrl",
  image: "imageUrl",
  suppliercode: "supplierCode",
  supplier_code: "supplierCode",
  kodesupplier: "supplierCode",
  kode_supplier: "supplierCode",
  kodepemasok: "supplierCode",
  kode_pemasok: "supplierCode",
};

export { HEADER_ALIASES };

const importCleaningFixSchema = z.object({
  ruleId: z.string(),
  field: z.enum(["price", "costPrice", "hargaDinas", "hargaAgen"]),
  oldValue: z.number().nullable(),
  newValue: z.number().nullable(),
});

export const importRowCommitSchema = z.object({
  rowNumber: z.number().int().min(1),
  name: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  category: z.string().trim().min(1),
  price: z.coerce.number(),
  stock: z.coerce.number().optional().default(0),
  stockProvided: z.boolean().optional(),
  unit: z.string().trim().min(1),
  unitMultiplierToBase: z.coerce.number().min(0).optional().nullable(),
  costPrice: z.coerce.number().min(0).optional().nullable(),
  hargaDinas: z.coerce.number().min(0).optional().nullable(),
  hargaDinasProvided: z.boolean().optional(),
  hargaAgen: z.coerce.number().min(0).optional().nullable(),
  hargaAgenProvided: z.boolean().optional(),
  minStock: z.coerce.number().int().min(0).optional(),
  barcode: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  size: z.string().trim().optional().nullable(),
  material: z.string().trim().optional().nullable(),
  imageUrl: z.string().trim().optional().nullable(),
  supplierCode: z.string().trim().optional().nullable(),
  supplierCodes: z.array(z.string().trim().min(1)).optional(),
  supplierCodesProvided: z.boolean().optional(),
  existingProductId: z.string().optional(),
  matchedProductId: z.string().optional(),
  matchedProductSku: z.string().optional(),
  matchedStockGroupId: z.string().optional().nullable(),
  generatedSku: z.string().optional(),
  sourceFamilyKey: z.string().optional(),
  cleaningStatus: z.enum(["clean", "auto_fixed", "review_required", "warning"]).optional(),
  cleaningIssues: z.array(z.string()).optional(),
  cleaningFixes: z.array(importCleaningFixSchema).optional(),
  autoAction: z
    .enum([
      "create",
      "auto_skip",
      "auto_price_update",
      "auto_create_variant",
      "conflict",
      "same_unit_price_conflict",
    ])
    .optional(),
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

export function parseSupplierCodes(value: unknown): string[] {
  return Array.from(
    new Set(
      normalizeValue(value)
        .split(",")
        .map((part) => normalizeSupplierCode(part))
        .filter((code): code is string => Boolean(code)),
    ),
  );
}

const PACKAGE_UNITS = new Set(["dus", "box", "pak", "pack", "ball", "rim"]);
const SMALL_UNITS = new Set(["pcs", "pc", "bh", "buah", "lbr", "lembar"]);
const PACKAGE_PRICE_LOWER_RULE = "PACKAGE_PRICE_LOWER_THAN_SMALL";
const PACKAGE_PRICE_LOWER_WARNING =
  "Auto-fixed package/small price fields because package unit price was lower than small unit price.";
const MISSING_BASE_ROW_WARNING = "Package unit has no small/base unit comparison row.";

function normalizeUnit(value: string) {
  return value.trim().toLowerCase();
}

function buildSourceFamilyKey(row: NormalizedImportRow) {
  if (row.sku.trim()) return row.sku.trim();
  return `${row.name.trim().toLowerCase()}|${row.category.trim().toLowerCase()}`;
}

function isSmallUnitRow(row: NormalizedImportRow) {
  const unit = normalizeUnit(row.unit);
  return row.unitMultiplierToBase === 1 || SMALL_UNITS.has(unit);
}

function isPackageUnitRow(row: NormalizedImportRow) {
  const unit = normalizeUnit(row.unit);
  return (row.unitMultiplierToBase ?? 0) > 1 || PACKAGE_UNITS.has(unit);
}

function addCleaningFix(
  row: NormalizedImportRow,
  fix: ImportCleaningFix,
) {
  row.cleaningStatus = "auto_fixed";
  row.cleaningIssues = Array.from(
    new Set([...(row.cleaningIssues ?? []), PACKAGE_PRICE_LOWER_WARNING]),
  );
  row.cleaningFixes = [...(row.cleaningFixes ?? []), fix];
}

function addReviewIssue(row: NormalizedImportRow, warning: string, warnings: string[]) {
  if (row.cleaningStatus !== "auto_fixed") row.cleaningStatus = "review_required";
  row.cleaningIssues = Array.from(new Set([...(row.cleaningIssues ?? []), warning]));
  if (!row.warnings.includes(warning)) {
    row.warnings.push(warning);
    warnings.push(`Row ${row.rowNumber}: ${warning}`);
  }
}

function swapFieldWhenPackageLower(
  smallRow: NormalizedImportRow,
  packageRow: NormalizedImportRow,
  field: "price" | "costPrice" | "hargaDinas" | "hargaAgen",
) {
  const smallValue = smallRow[field] ?? null;
  const packageValue = packageRow[field] ?? null;
  if (
    smallValue == null ||
    packageValue == null ||
    smallValue <= 0 ||
    packageValue <= 0 ||
    packageValue >= smallValue
  ) {
    return false;
  }

  smallRow[field] = packageValue as never;
  packageRow[field] = smallValue as never;
  addCleaningFix(smallRow, {
    ruleId: PACKAGE_PRICE_LOWER_RULE,
    field,
    oldValue: smallValue,
    newValue: packageValue,
  });
  addCleaningFix(packageRow, {
    ruleId: PACKAGE_PRICE_LOWER_RULE,
    field,
    oldValue: packageValue,
    newValue: smallValue,
  });
  return true;
}

function applyImportCleaning(rows: NormalizedImportRow[], warnings: string[]) {
  const rowsByFamily = new Map<string, NormalizedImportRow[]>();

  for (const row of rows) {
    const sourceFamilyKey = buildSourceFamilyKey(row);
    row.sourceFamilyKey = sourceFamilyKey;
    row.cleaningStatus = "clean";
    rowsByFamily.set(sourceFamilyKey, [
      ...(rowsByFamily.get(sourceFamilyKey) ?? []),
      row,
    ]);
  }

  for (const familyRows of rowsByFamily.values()) {
    const smallRow = familyRows.find(isSmallUnitRow);
    if (!smallRow) {
      for (const row of familyRows) {
        if (isPackageUnitRow(row)) addReviewIssue(row, MISSING_BASE_ROW_WARNING, warnings);
      }
      continue;
    }

    for (const packageRow of familyRows) {
      if (packageRow === smallRow || !isPackageUnitRow(packageRow)) continue;
      const priceChanged = swapFieldWhenPackageLower(smallRow, packageRow, "price");
      const costChanged = swapFieldWhenPackageLower(smallRow, packageRow, "costPrice");
      const hargaDinasChanged = swapFieldWhenPackageLower(smallRow, packageRow, "hargaDinas");
      const hargaAgenChanged = swapFieldWhenPackageLower(smallRow, packageRow, "hargaAgen");
      const changed = priceChanged || costChanged || hargaDinasChanged || hargaAgenChanged;

      if (changed) {
        for (const row of [smallRow, packageRow]) {
          if (!row.warnings.includes(PACKAGE_PRICE_LOWER_WARNING)) {
            row.warnings.push(PACKAGE_PRICE_LOWER_WARNING);
            warnings.push(`Row ${row.rowNumber}: ${PACKAGE_PRICE_LOWER_WARNING}`);
          }
        }
      }
    }
  }
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
    const stockRaw = normalizeValue(record.stock);
    const stockProvided = stockRaw.length > 0;
    const stock = stockProvided ? toNumber(record.stock) : 0;
    const minStockRaw = normalizeValue(record.minStock);
    const costPriceRaw = normalizeValue(record.costPrice);
    const hargaDinasRaw = normalizeValue(record.hargaDinas);
    const hargaDinasProvided = Object.prototype.hasOwnProperty.call(record, "hargaDinas");
    const hargaAgenRaw = normalizeValue(record.hargaAgen);
    const hargaAgenProvided = hargaAgenRaw.length > 0;
    const supplierCodeRaw = normalizeValue(record.supplierCode);
    const supplierCodes = parseSupplierCodes(record.supplierCode);
    const unitMultiplierRaw = normalizeValue(record.unitMultiplierToBase);
    const minStock = minStockRaw ? toNumber(record.minStock) : 5;
    const costPrice = costPriceRaw ? toNumber(record.costPrice) : Number.NaN;
    const hargaDinas = hargaDinasRaw ? toNumber(record.hargaDinas) : Number.NaN;
    const hargaAgen = hargaAgenRaw ? toNumber(record.hargaAgen) : Number.NaN;
    const unitMultiplierToBase = unitMultiplierRaw ? toNumber(record.unitMultiplierToBase) : Number.NaN;

    if (!normalizeValue(record.name)) rowErrors.push("Name is required.");
    if (!sku) rowErrors.push("SKU is required.");
    if (!category) rowErrors.push("Category is required.");
    if (!Number.isFinite(price)) {
      rowWarnings.push("Price was not a valid number and will be imported as 0.");
    }
    if (!normalizeValue(record.unit)) rowErrors.push("Unit is required.");
    if (stockProvided && !Number.isFinite(stock)) {
      rowWarnings.push("Stock was not a valid number and will be imported as 0.");
    }
    if (Number.isFinite(stock) && stock < 0) {
      rowWarnings.push("This stock is not supposed to be negative.");
    }
    if (costPriceRaw && (!Number.isFinite(costPrice) || costPrice < 0)) {
      rowWarnings.push("Cost price was not a valid number and will be imported as empty.");
    }
    if (hargaDinasRaw && (!Number.isFinite(hargaDinas) || hargaDinas < 0)) {
      rowWarnings.push("Harga Dinas was not a valid number and will be imported as empty.");
    }
    if (hargaDinasRaw && Number.isFinite(hargaDinas) && hargaDinas > 0 && Number.isFinite(price) && hargaDinas < price) {
      rowWarnings.push("Harga Dinas is lower than regular price.");
    }
    if (hargaAgenRaw && (!Number.isFinite(hargaAgen) || hargaAgen < 0)) {
      rowWarnings.push("Harga Agen was not a valid number and will be imported as empty.");
    }
    if (hargaAgenRaw && Number.isFinite(hargaAgen) && hargaAgen >= 0 && Number.isFinite(price) && hargaAgen < price) {
      rowWarnings.push("Harga Agen is lower than regular price.");
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
      stockProvided,
      unit: normalizeValue(record.unit),
      unitMultiplierToBase:
        unitMultiplierRaw && Number.isFinite(unitMultiplierToBase) && unitMultiplierToBase > 0
          ? unitMultiplierToBase
          : null,
      costPrice: costPriceRaw && Number.isFinite(costPrice) && costPrice >= 0 ? costPrice : null,
      hargaDinas:
        hargaDinasRaw && Number.isFinite(hargaDinas) && hargaDinas > 0
          ? hargaDinas
          : null,
      hargaDinasProvided,
      hargaAgen:
        hargaAgenRaw && Number.isFinite(hargaAgen) && hargaAgen >= 0
          ? hargaAgen
          : null,
      hargaAgenProvided,
      minStock: minStockRaw && Number.isFinite(minStock) && minStock >= 0 ? Math.trunc(minStock) : 5,
      barcode: normalizeValue(record.barcode) || null,
      description: normalizeValue(record.description) || null,
      size: normalizeValue(record.size) || null,
      material: normalizeValue(record.material) || null,
      imageUrl: normalizeValue(record.imageUrl) || null,
      supplierCodes,
      supplierCodesProvided: supplierCodeRaw.length > 0,
      duplicateInFile,
      existingProductId: existingProduct?.id,
      existingProductName: existingProduct?.name,
      missingCategory,
      warnings: rowWarnings,
      errors: rowErrors,
    };
  });

  applyImportCleaning(rows, warnings);

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

export function buildCleanedImportRows(rows: NormalizedImportRow[]) {
  return rows.map((row) => ({
    name: row.name,
    sku: row.sku,
    category: row.category,
    price: row.price,
    stock: row.stock,
    unit: row.unit,
    unitMultiplierToBase: row.unitMultiplierToBase ?? "",
    costPrice: row.costPrice ?? "",
    hargaDinas: row.hargaDinas ?? "",
    hargaAgen: row.hargaAgen ?? "",
    minStock: row.minStock ?? "",
    barcode: row.barcode ?? "",
    description: row.description ?? "",
    size: row.size ?? "",
    material: row.material ?? "",
    imageUrl: row.imageUrl ?? "",
    supplierCode: (row.supplierCodes ?? []).join(", "),
  }));
}

export function buildCleaningChangeLogRows(rows: NormalizedImportRow[]) {
  return rows.flatMap((row) =>
    (row.cleaningFixes ?? []).map((fix) => ({
      rowNumber: row.rowNumber,
      sourceFamilyKey: row.sourceFamilyKey ?? "",
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      field: fix.field,
      oldValue: fix.oldValue,
      newValue: fix.newValue,
      ruleId: fix.ruleId,
      confidence: "high",
    })),
  );
}

export function revertImportCleaningFixes(rows: NormalizedImportRow[]): NormalizedImportRow[] {
  return rows.map((row) => {
    const reverted: NormalizedImportRow = {
      ...row,
      warnings: row.warnings.filter((warning) => warning !== PACKAGE_PRICE_LOWER_WARNING),
    };

    for (const fix of row.cleaningFixes ?? []) {
      if (fix.field === "price") reverted.price = Number(fix.oldValue ?? 0);
      if (fix.field === "costPrice") reverted.costPrice = fix.oldValue;
      if (fix.field === "hargaDinas") reverted.hargaDinas = fix.oldValue;
      if (fix.field === "hargaAgen") reverted.hargaAgen = fix.oldValue;
    }

    if (row.cleaningStatus === "auto_fixed") {
      reverted.cleaningStatus = "clean";
      reverted.cleaningIssues = [];
      reverted.cleaningFixes = [];
    }

    return reverted;
  });
}

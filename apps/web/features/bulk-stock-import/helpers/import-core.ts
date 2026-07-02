export const BULK_STOCK_IMPORT_COLUMNS = [
  "name",
  "category",
  "unit",
  "stock",
] as const;

export type BulkStockImportColumn = (typeof BULK_STOCK_IMPORT_COLUMNS)[number];
export type BulkStockImportMode = "ADD" | "SET";
export type BulkStockImportStatus = "valid" | "skipped" | "error";
export type BulkStockColumnMapping = Record<string, BulkStockImportColumn | "">;

export interface BulkStockImportProduct {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  unit: string;
  stock: number;
}

export interface BulkStockImportCandidate {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  unit: string;
  stock: number;
}

export interface BulkStockImportRow {
  rowNumber: number;
  name: string;
  category: string;
  unit: string;
  stock: number;
  currentStock?: number;
  beforeStock?: number;
  afterStock?: number;
  selectedProductId?: string;
  productId: string | null;
  sku: string | null;
  candidates?: BulkStockImportCandidate[];
  status: BulkStockImportStatus;
  warnings: string[];
  errors: string[];
  notes?: string[];
}

export interface BulkStockImportImpact {
  productId: string;
  sku: string;
  quantity: number;
  delta: number;
  beforeStock: number;
  afterStock: number;
  sourceRowNumbers: number[];
}

const HEADER_ALIASES: Record<string, BulkStockImportColumn> = {
  name: "name",
  productname: "name",
  product_name: "name",
  nameproduct: "name",
  name_product: "name",
  namaproduk: "name",
  nama_produk: "name",
  namaproduct: "name",
  nama_product: "name",
  namaitem: "name",
  nama_item: "name",
  nama: "name",
  category: "category",
  kategori: "category",
  jenis: "category",
  unit: "unit",
  satuan: "unit",
  stock: "stock",
  stok: "stock",
};

const DUPLICATE_WARNING =
  "Duplicate product row. Add mode will aggregate quantities; set mode will use the last row.";
export const AMBIGUOUS_PRODUCT_ERROR = "Matched product is ambiguous.";
export const STALE_SELECTED_PRODUCT_ERROR =
  "Selected product no longer matches this row.";
export const MANUAL_SELECTION_WARNING =
  "Duplicate products exist; selected manually.";
export const UNCHANGED_STOCK_NOTE = "Stock is unchanged.";

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeMatchValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  const raw = String(value ?? "")
    .trim()
    .replace(/[^\d.,-]/g, "");
  if (!raw) return Number.NaN;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let cleaned = raw;
  if (hasComma && hasDot) {
    cleaned = raw.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    cleaned = raw.replace(",", ".");
  } else if (hasDot) {
    const [whole, fraction] = raw.split(".");
    cleaned =
      fraction?.length === 3
        ? raw.replace(/\./g, "")
        : raw;
  }
  if (!cleaned) return Number.NaN;
  return Number(cleaned);
}

function productKey(input: { name: string; categoryName: string; unit: string }) {
  return [
    normalizeMatchValue(input.name),
    normalizeMatchValue(input.categoryName),
    normalizeMatchValue(input.unit),
  ].join("|");
}

function rowKey(input: { name: string; category: string; unit: string }) {
  return [
    normalizeMatchValue(input.name),
    normalizeMatchValue(input.category),
    normalizeMatchValue(input.unit),
  ].join("|");
}

export function normalizeBulkStockHeader(value: unknown): BulkStockImportColumn | string {
  const key = normalizeKey(value);
  return HEADER_ALIASES[key] ?? key;
}

export function buildMissingBulkStockColumns(headers: string[]) {
  const headerSet = new Set(headers);
  return BULK_STOCK_IMPORT_COLUMNS.filter((column) => !headerSet.has(column));
}

function normalizeValue(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export function normalizeBulkStockImportRows(
  records: Array<Record<string, unknown>>,
  products: BulkStockImportProduct[],
) {
  const productsByKey = new Map<string, BulkStockImportProduct[]>();
  for (const product of products) {
    const key = productKey(product);
    productsByKey.set(key, [...(productsByKey.get(key) ?? []), product]);
  }

  const rows: BulkStockImportRow[] = records.map((record, index) => {
    const rowNumber = index + 2;
    const name = String(record.name ?? "").trim();
    const category = String(record.category ?? "").trim();
    const unit = String(record.unit ?? "").trim();
    const selectedProductId = String(record.selectedProductId ?? "").trim();
    const stock = toNumber(record.stock);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!name) errors.push("Name is required.");
    if (!category) errors.push("Category is required.");
    if (!unit) errors.push("Unit is required.");
    if (!Number.isFinite(stock)) errors.push("Stock must be a valid number.");

    const matches = productsByKey.get(rowKey({ name, category, unit })) ?? [];
    const selectedProduct = selectedProductId
      ? matches.find((match) => match.id === selectedProductId)
      : null;
    if (selectedProductId && !selectedProduct) {
      errors.push(STALE_SELECTED_PRODUCT_ERROR);
    } else if (matches.length > 1 && !selectedProduct) {
      errors.push(AMBIGUOUS_PRODUCT_ERROR);
    }
    if (matches.length > 1 && selectedProduct) {
      warnings.push(MANUAL_SELECTION_WARNING);
    }

    const product = selectedProductId
      ? selectedProduct
      : matches.length === 1
        ? matches[0]
        : null;
    const status: BulkStockImportStatus =
      errors.length > 0 ? "error" : product ? "valid" : "skipped";

    return {
      rowNumber,
      name,
      category,
      unit,
      stock: Number.isFinite(stock) ? stock : 0,
      currentStock: product?.stock,
      selectedProductId: selectedProductId || undefined,
      productId: product?.id ?? null,
      sku: product?.sku ?? null,
      candidates:
        matches.length > 1
          ? matches.map((match) => ({
              id: match.id,
              name: match.name,
              sku: match.sku,
              categoryName: match.categoryName,
              unit: match.unit,
              stock: match.stock,
            }))
          : undefined,
      status,
      warnings,
      errors,
      notes: [],
    };
  });

  const validProductCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "valid" || !row.productId) continue;
    validProductCounts.set(row.productId, (validProductCounts.get(row.productId) ?? 0) + 1);
  }
  for (const row of rows) {
    if (
      row.status === "valid" &&
      row.productId &&
      (validProductCounts.get(row.productId) ?? 0) > 1
    ) {
      row.warnings.push(DUPLICATE_WARNING);
    }
  }

  return {
    rows,
    summary: {
      validRows: rows.filter((row) => row.status === "valid").length,
      skippedRows: rows.filter((row) => row.status === "skipped").length,
      errorRows: rows.filter((row) => row.status === "error").length,
      warningRows: rows.filter((row) => row.warnings.length > 0).length,
    },
  };
}

export function summarizeBulkStockImportRows(rows: BulkStockImportRow[]) {
  return {
    validRows: rows.filter((row) => row.status === "valid").length,
    skippedRows: rows.filter((row) => row.status === "skipped").length,
    errorRows: rows.filter((row) => row.status === "error").length,
    warningRows: rows.filter((row) => row.warnings.length > 0).length,
  };
}

export function applyBulkStockImportRowSelections(
  rows: BulkStockImportRow[],
  selections: Record<number, string | undefined>,
) {
  const resolvedRows = rows.map((row) => {
    const selectedProductId = selections[row.rowNumber];
    if (!selectedProductId || !row.candidates?.length) return row;

    const candidate = row.candidates.find(
      (item) => item.id === selectedProductId,
    );
    if (!candidate) return row;

    const errors = row.errors.filter(
      (error) => error !== AMBIGUOUS_PRODUCT_ERROR,
    );
    const warnings = row.warnings.includes(MANUAL_SELECTION_WARNING)
      ? row.warnings
      : [...row.warnings, MANUAL_SELECTION_WARNING];

    return {
      ...row,
      selectedProductId,
      productId: candidate.id,
      sku: candidate.sku,
      currentStock: candidate.stock,
      status: errors.length > 0 ? row.status : "valid",
      errors,
      warnings,
    } satisfies BulkStockImportRow;
  });

  return {
    rows: resolvedRows,
    summary: summarizeBulkStockImportRows(resolvedRows),
  };
}

export function applyBulkStockImportSetModeSkips(
  rows: BulkStockImportRow[],
  mode: BulkStockImportMode,
) {
  if (mode !== "SET") {
    return {
      rows,
      summary: summarizeBulkStockImportRows(rows),
    };
  }

  const resolvedRows = rows.map((row) => {
    if (
      row.status !== "valid" ||
      !row.productId ||
      row.currentStock === undefined ||
      row.stock !== row.currentStock
    ) {
      return row;
    }

    const notes = row.notes?.includes(UNCHANGED_STOCK_NOTE)
      ? row.notes
      : [...(row.notes ?? []), UNCHANGED_STOCK_NOTE];

    return {
      ...row,
      status: "skipped",
      notes,
    } satisfies BulkStockImportRow;
  });

  return {
    rows: resolvedRows,
    summary: summarizeBulkStockImportRows(resolvedRows),
  };
}

export function applyBulkStockImportStockChanges(
  rows: BulkStockImportRow[],
  mode: BulkStockImportMode,
) {
  const validRows = rows.filter(
    (row): row is BulkStockImportRow & { productId: string; currentStock: number } =>
      row.status === "valid" &&
      Boolean(row.productId) &&
      row.currentStock !== undefined,
  );
  const rowsByProduct = new Map<string, Array<BulkStockImportRow & { productId: string; currentStock: number }>>();
  for (const row of validRows) {
    rowsByProduct.set(row.productId, [...(rowsByProduct.get(row.productId) ?? []), row]);
  }

  const afterStockByProduct = new Map<string, number>();
  for (const [productId, productRows] of rowsByProduct.entries()) {
    const beforeStock = productRows[0].currentStock;
    const afterStock =
      mode === "ADD"
        ? beforeStock + productRows.reduce((sum, row) => sum + row.stock, 0)
        : productRows[productRows.length - 1].stock;
    afterStockByProduct.set(productId, afterStock);
  }

  return rows.map((row) => {
    if (
      row.status !== "valid" ||
      !row.productId ||
      row.currentStock === undefined
    ) {
      return {
        ...row,
        beforeStock: undefined,
        afterStock: undefined,
      } satisfies BulkStockImportRow;
    }

    return {
      ...row,
      beforeStock: row.currentStock,
      afterStock: afterStockByProduct.get(row.productId),
    } satisfies BulkStockImportRow;
  });
}

export function buildBulkStockImportImpacts(
  rows: BulkStockImportRow[],
  products: BulkStockImportProduct[],
  mode: BulkStockImportMode,
): BulkStockImportImpact[] {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const validRows = rows.filter(
    (row): row is BulkStockImportRow & { productId: string; sku: string } =>
      row.status === "valid" && Boolean(row.productId) && Boolean(row.sku),
  );

  const rowsByProduct = new Map<string, Array<BulkStockImportRow & { productId: string; sku: string }>>();
  for (const row of validRows) {
    rowsByProduct.set(row.productId, [...(rowsByProduct.get(row.productId) ?? []), row]);
  }

  return Array.from(rowsByProduct.entries()).flatMap(([productId, productRows]) => {
    const product = productsById.get(productId);
    if (!product) return [];

    if (mode === "ADD") {
      const quantity = productRows.reduce((sum, row) => sum + row.stock, 0);
      return [
        {
          productId,
          sku: product.sku,
          quantity,
          delta: quantity,
          beforeStock: product.stock,
          afterStock: product.stock + quantity,
          sourceRowNumbers: productRows.map((row) => row.rowNumber),
        },
      ];
    }

    const row = productRows[productRows.length - 1];
    const delta = row.stock - product.stock;
    if (delta === 0) return [];

    return [
      {
        productId,
        sku: product.sku,
        quantity: row.stock,
        delta,
        beforeStock: product.stock,
        afterStock: row.stock,
        sourceRowNumbers: [row.rowNumber],
      },
    ];
  });
}

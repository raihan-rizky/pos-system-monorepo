import { calculateDisplayStock, calculateBaseQuantity } from "@/features/product-stock-groups/stock-display";

export type StockGroupBulkType = "IN" | "OUT" | "ADJUSTMENT";
export type ProductFirstStockMode = "GROUP_STOCK" | "PRODUCT_ONLY";
export type StockGroupBulkBasis =
  | { mode: "BASE" }
  | { mode: "VARIANT"; variantProductId: string };

export interface StockGroupBulkVariant {
  id: string;
  name: string;
  sku: string;
  unit: string;
  unitMultiplierToBase: number;
  conversionNeedsReview: boolean;
  stock: number;
}

export interface StockGroupBulkPreviewInput {
  type: StockGroupBulkType;
  stockInput: StockGroupBulkBasis;
  inputValue: number;
  group: {
    id: string;
    displayName: string;
    baseUnit: string;
    baseStock: number;
    variants: StockGroupBulkVariant[];
  };
}

export interface StockGroupBulkPreviewVariant extends StockGroupBulkVariant {
  beforeStock: number;
  afterStock: number;
  delta: number;
  beforeBaseStock: number;
  afterBaseStock: number;
}

export interface StockGroupBulkPreview {
  stockGroupId: string;
  displayName: string;
  baseUnit: string;
  type: StockGroupBulkType;
  stockInput: StockGroupBulkBasis;
  inputValue: number;
  beforeBaseStock: number;
  afterBaseStock: number;
  baseDelta: number;
  variants: StockGroupBulkPreviewVariant[];
  changedVariants: StockGroupBulkPreviewVariant[];
}

export interface ProductFirstStockBulkRowInput {
  productId: string;
  mode: ProductFirstStockMode;
  type: StockGroupBulkType;
  inputValue: number;
  note?: string | null;
}

export interface ProductFirstStockBulkProduct extends StockGroupBulkVariant {
  stockGroupId?: string | null;
}

export interface ProductFirstStockBulkGroup {
  id: string;
  displayName: string;
  baseUnit: string;
  baseStock: number;
  variants: ProductFirstStockBulkProduct[];
}

export interface ProductOnlyStockPreview extends ProductFirstStockBulkProduct {
  mode: "PRODUCT_ONLY";
  productId: string;
  type: StockGroupBulkType;
  inputValue: number;
  beforeStock: number;
  afterStock: number;
  delta: number;
  logQuantity: number;
  note: string;
}

export interface ProductFirstStockGroupPreview extends StockGroupBulkPreview {
  mode: "GROUP_STOCK";
  productId: string;
  productName: string;
  stockGroupName: string;
}

export interface ProductFirstStockBulkPreview {
  rows: Array<ProductFirstStockGroupPreview | ProductOnlyStockPreview>;
  bundledRows: ProductFirstStockGroupPreview[];
  standaloneRows: ProductOnlyStockPreview[];
}

function assertFinitePositiveMultiplier(variant: StockGroupBulkVariant) {
  if (
    !Number.isFinite(variant.unitMultiplierToBase) ||
    variant.unitMultiplierToBase <= 0 ||
    variant.conversionNeedsReview
  ) {
    throw new Error("INVALID_CONVERSION");
  }
}

export function calculateStockGroupBulkPreview(
  input: StockGroupBulkPreviewInput,
): StockGroupBulkPreview {
  if (input.type !== "IN" && input.type !== "OUT" && input.type !== "ADJUSTMENT") {
    throw new Error("INVALID_TYPE");
  }
  if (!Number.isFinite(input.inputValue) || input.inputValue < 0) {
    throw new Error("INVALID_QUANTITY");
  }
  if (input.group.variants.length === 0) {
    throw new Error("EMPTY_GROUP");
  }

  for (const variant of input.group.variants) {
    assertFinitePositiveMultiplier(variant);
  }

  const beforeBaseStock = input.group.baseStock;
  let inputBaseQuantity = input.inputValue;
  if (input.stockInput.mode === "VARIANT") {
    const variantProductId = input.stockInput.variantProductId;
    const inputVariant = input.group.variants.find(
      (candidate) => candidate.id === variantProductId,
    );
    if (!inputVariant) throw new Error("VARIANT_NOT_FOUND");
    inputBaseQuantity = calculateBaseQuantity(
      input.inputValue,
      inputVariant.unitMultiplierToBase,
    );
  }

  const afterBaseStock =
    input.type === "IN"
      ? beforeBaseStock + inputBaseQuantity
      : input.type === "OUT"
        ? beforeBaseStock - inputBaseQuantity
        : inputBaseQuantity;

  if (afterBaseStock < 0) {
    throw new Error("NEGATIVE_STOCK");
  }

  const variants = input.group.variants.map((variant) => {
    const beforeStock = calculateDisplayStock(
      beforeBaseStock,
      variant.unitMultiplierToBase,
    );
    const afterStock = calculateDisplayStock(
      afterBaseStock,
      variant.unitMultiplierToBase,
    );
    const delta = afterStock - beforeStock;

    return {
      ...variant,
      beforeStock,
      afterStock,
      delta,
      beforeBaseStock,
      afterBaseStock,
    };
  });

  return {
    stockGroupId: input.group.id,
    displayName: input.group.displayName,
    baseUnit: input.group.baseUnit,
    type: input.type,
    stockInput: input.stockInput,
    inputValue: input.inputValue,
    beforeBaseStock,
    afterBaseStock,
    baseDelta: afterBaseStock - beforeBaseStock,
    variants,
    changedVariants: variants.filter((variant) => Math.abs(variant.delta) > 1e-9),
  };
}

export function stockGroupBulkAction(type: StockGroupBulkType) {
  if (type === "IN") return "STOCK_IN";
  return type === "OUT" ? "STOCK_OUT" : "ADJUSTMENT";
}

export function stockGroupBulkReason(type: StockGroupBulkType) {
  if (type === "IN") return "RESTOCK";
  return type === "OUT" ? "USAGE" : "OPNAME";
}

function normalizedProductKey(product: ProductFirstStockBulkProduct) {
  return [product.name, product.sku, product.unit]
    .map((part) => part.trim().toLowerCase())
    .join("|");
}

function calculateAfterStock(
  type: StockGroupBulkType,
  beforeStock: number,
  inputValue: number,
) {
  if (type === "IN") return beforeStock + inputValue;
  if (type === "OUT") return beforeStock - inputValue;
  return inputValue;
}

function productOnlyNote(note?: string | null) {
  const suffix = "Mode: Stok Produk Ini - stok grup tidak diubah";
  const trimmed = note?.trim();
  return trimmed ? `${trimmed}\n${suffix}` : suffix;
}

function productOnlyLogQuantity(
  type: StockGroupBulkType,
  inputValue: number,
  delta: number,
) {
  if (type === "ADJUSTMENT") return delta;
  return Math.abs(inputValue);
}

export function calculateProductFirstStockGroupBulkPreview(input: {
  rows: ProductFirstStockBulkRowInput[];
  products: ProductFirstStockBulkProduct[];
  groups: ProductFirstStockBulkGroup[];
}): ProductFirstStockBulkPreview {
  if (input.rows.length === 0) throw new Error("EMPTY_ROWS");

  const productById = new Map(input.products.map((product) => [product.id, product]));
  const groupById = new Map(input.groups.map((group) => [group.id, group]));
  const seenProducts = new Set<string>();
  const seenSharedGroups = new Set<string>();
  const rows: Array<ProductFirstStockGroupPreview | ProductOnlyStockPreview> = [];

  for (const row of input.rows) {
    if (!Number.isFinite(row.inputValue) || row.inputValue < 0) {
      throw new Error("INVALID_QUANTITY");
    }

    const product = productById.get(row.productId);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");

    const duplicateKey = normalizedProductKey(product);
    if (seenProducts.has(duplicateKey)) throw new Error("DUPLICATE_PRODUCT");
    seenProducts.add(duplicateKey);

    const stockGroupId = product.stockGroupId ?? null;
    const group = stockGroupId ? groupById.get(stockGroupId) : null;

    if (row.mode === "GROUP_STOCK" && group) {
      if (seenSharedGroups.has(group.id)) throw new Error("DUPLICATE_GROUP_STOCK");
      seenSharedGroups.add(group.id);

      const preview = calculateStockGroupBulkPreview({
        type: row.type,
        stockInput: { mode: "VARIANT", variantProductId: product.id },
        inputValue:
          row.type === "ADJUSTMENT"
            ? row.inputValue
            : Math.abs(row.inputValue),
        group,
      });

      rows.push({
        ...preview,
        mode: "GROUP_STOCK",
        productId: product.id,
        productName: product.name,
        stockGroupName: group.displayName,
      });
      continue;
    }

    assertFinitePositiveMultiplier(product);
    const beforeStock = product.stock;
    const afterStock = calculateAfterStock(row.type, beforeStock, row.inputValue);
    if (afterStock < 0) throw new Error("NEGATIVE_STOCK");
    const delta = afterStock - beforeStock;

    rows.push({
      ...product,
      mode: "PRODUCT_ONLY",
      productId: product.id,
      type: row.type,
      inputValue: row.inputValue,
      beforeStock,
      afterStock,
      delta,
      logQuantity: productOnlyLogQuantity(row.type, row.inputValue, delta),
      note: productOnlyNote(row.note),
    });
  }

  const bundledRows = rows.filter(
    (row): row is ProductFirstStockGroupPreview => row.mode === "GROUP_STOCK",
  );
  const standaloneRows = rows.filter(
    (row): row is ProductOnlyStockPreview => row.mode === "PRODUCT_ONLY",
  );

  return { rows, bundledRows, standaloneRows };
}

import { calculateDisplayStock, calculateBaseQuantity } from "@/features/product-stock-groups/stock-display";

export type StockGroupBulkType = "OUT" | "ADJUSTMENT";
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
  if (input.type !== "OUT" && input.type !== "ADJUSTMENT") {
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
    input.type === "OUT"
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
  return type === "OUT" ? "STOCK_OUT" : "ADJUSTMENT";
}

export function stockGroupBulkReason(type: StockGroupBulkType) {
  return type === "OUT" ? "USAGE" : "OPNAME";
}

export type StockInput =
  | { mode: "BASE"; variantProductId?: never }
  | { mode: "VARIANT"; variantProductId: string };

export interface StockInputVariant {
  id: string;
  unit?: string;
  stock?: number;
  unitMultiplierToBase: number;
}

export interface ConversionPairInput {
  fromProductId: string;
  fromQuantity: number;
  toProductId: string;
  toQuantity: number;
}

export interface ConversionPairSummary {
  fromProductId: string;
  fromUnit: string;
  fromQuantity: number;
  toProductId: string;
  toUnit: string;
  toQuantity: number;
  label: string;
}

export interface ProductAssignmentInput {
  productId: string;
  unitMultiplierToBase?: number | null;
}

export interface DirectMultiplierInput {
  productId: string;
  unitMultiplierToBase: number;
}

export interface ConfirmableStockProduct {
  id: string;
  unit: string;
  stock: number;
}

export type ConversionEditMode = "PRESERVE_SOURCE_STOCK" | "KEEP_SHARED_STOCK";

function normalizeUnit(unit: string) {
  return unit.trim().toLowerCase();
}

function formatQuantity(value: number) {
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(4)).toString();
}

export function assertUniqueActiveUnits(
  variants: ReadonlyArray<{ unit: string }>,
) {
  const seen = new Map<string, string>();
  for (const variant of variants) {
    const normalized = normalizeUnit(variant.unit);
    if (!normalized) throw new Error("UNIT_REQUIRED");
    if (seen.has(normalized)) throw new Error("DUPLICATE_UNIT");
    seen.set(normalized, variant.unit);
  }
}

export function resolveMultipliersFromConversionPairs(input: {
  variants: ReadonlyArray<{
    id: string;
    unit: string;
    stock?: number | null;
  }>;
  sourceProductId: string;
  conversionPairs: ReadonlyArray<ConversionPairInput>;
}) {
  const variantIds = new Set(input.variants.map((variant) => variant.id));
  if (!variantIds.has(input.sourceProductId)) {
    throw new Error("SOURCE_PRODUCT_NOT_FOUND");
  }

  const multipliers = new Map<string, number>([[input.sourceProductId, 1]]);
  const pending = input.conversionPairs.map((pair) => {
    if (
      !variantIds.has(pair.fromProductId) ||
      !variantIds.has(pair.toProductId)
    ) {
      throw new Error("CONVERSION_PAIR_PRODUCT_NOT_FOUND");
    }
    if (pair.fromProductId === pair.toProductId) {
      throw new Error("INVALID_CONVERSION_PAIR");
    }
    if (
      !Number.isFinite(pair.fromQuantity) ||
      !Number.isFinite(pair.toQuantity) ||
      pair.fromQuantity <= 0 ||
      pair.toQuantity <= 0
    ) {
      throw new Error("INVALID_CONVERSION_PAIR");
    }
    return pair;
  });

  let changed = true;
  while (changed && multipliers.size < input.variants.length) {
    changed = false;
    for (const pair of pending) {
      const fromMultiplier = multipliers.get(pair.fromProductId);
      const toMultiplier = multipliers.get(pair.toProductId);

      if (fromMultiplier !== undefined && toMultiplier === undefined) {
        multipliers.set(
          pair.toProductId,
          (pair.fromQuantity * fromMultiplier) / pair.toQuantity,
        );
        changed = true;
      } else if (toMultiplier !== undefined && fromMultiplier === undefined) {
        multipliers.set(
          pair.fromProductId,
          (pair.toQuantity * toMultiplier) / pair.fromQuantity,
        );
        changed = true;
      }
    }
  }

  if (multipliers.size !== input.variants.length) {
    throw new Error("CONVERSION_PAIR_DISCONNECTED");
  }

  return input.variants.map((variant) => {
    const unitMultiplierToBase = multipliers.get(variant.id);
    if (
      unitMultiplierToBase === undefined ||
      !Number.isFinite(unitMultiplierToBase) ||
      unitMultiplierToBase <= 0
    ) {
      throw new Error("INVALID_CONVERSION_PAIR");
    }
    return {
      id: variant.id,
      unit: variant.unit,
      stock: variant.stock ?? undefined,
      unitMultiplierToBase,
    };
  });
}

export function resolveMultipliersFromDirectAssignments(input: {
  variants: ReadonlyArray<{
    id: string;
    unit: string;
    stock?: number | null;
  }>;
  baseProductId: string;
  directMultipliers: ReadonlyArray<DirectMultiplierInput>;
}) {
  const variantIds = new Set(input.variants.map((variant) => variant.id));
  if (!variantIds.has(input.baseProductId)) {
    throw new Error("BASE_PRODUCT_NOT_FOUND");
  }

  const assignments = new Map(
    input.directMultipliers.map((assignment) => [
      assignment.productId,
      assignment.unitMultiplierToBase,
    ]),
  );

  return input.variants.map((variant) => {
    const multiplier = assignments.get(variant.id);
    if (
      multiplier === undefined ||
      !Number.isFinite(multiplier) ||
      multiplier <= 0
    ) {
      throw new Error("INVALID_MULTIPLIER");
    }

    return {
      id: variant.id,
      unit: variant.unit,
      stock: variant.stock ?? undefined,
      unitMultiplierToBase:
        variant.id === input.baseProductId ? 1 : multiplier,
    };
  });
}

export function resolveSourceBaseStock(input: {
  sourceProductId: string;
  variants: ReadonlyArray<StockInputVariant>;
}) {
  const source = input.variants.find(
    (variant) => variant.id === input.sourceProductId,
  );
  if (!source || source.stock === undefined) {
    throw new Error("SOURCE_PRODUCT_NOT_FOUND");
  }

  return source.stock * source.unitMultiplierToBase;
}

export function buildStockConflictWarnings(input: {
  sourceProductId: string;
  baseStock: number;
  variants: ReadonlyArray<StockInputVariant>;
}) {
  const warnings: Array<{
    productId: string;
    unit: string;
    currentStock: number;
    convertedStock: number;
  }> = [];

  for (const variant of input.variants) {
    if (
      variant.id === input.sourceProductId ||
      variant.stock === undefined ||
      !variant.unit
    ) {
      continue;
    }
    const convertedStock = input.baseStock / variant.unitMultiplierToBase;
    if (Math.abs(convertedStock - variant.stock) > 0.0001) {
      warnings.push({
        productId: variant.id,
        unit: variant.unit,
        currentStock: variant.stock,
        convertedStock,
      });
    }
  }

  return warnings;
}

export function buildConversionPairSummaries(
  variants: ReadonlyArray<StockInputVariant>,
): ConversionPairSummary[] {
  const withUnits = variants.filter(
    (variant): variant is StockInputVariant & { unit: string } =>
      Boolean(variant.unit) &&
      Number.isFinite(variant.unitMultiplierToBase) &&
      variant.unitMultiplierToBase > 0,
  );
  if (withUnits.length < 2) return [];

  const smallestUnit = [...withUnits].sort(
    (a, b) => a.unitMultiplierToBase - b.unitMultiplierToBase,
  )[0];

  return withUnits
    .filter((variant) => variant.id !== smallestUnit.id)
    .sort((a, b) => b.unitMultiplierToBase - a.unitMultiplierToBase)
    .map((variant) => {
      const toQuantity =
        variant.unitMultiplierToBase / smallestUnit.unitMultiplierToBase;
      return {
        fromProductId: variant.id,
        fromUnit: variant.unit,
        fromQuantity: 1,
        toProductId: smallestUnit.id,
        toUnit: smallestUnit.unit,
        toQuantity,
        label: `1 ${variant.unit} = ${formatQuantity(toQuantity)} ${smallestUnit.unit}`,
      };
    });
}

export function resolveConfirmedGroupStock(input: {
  products: ReadonlyArray<ConfirmableStockProduct>;
  assignments: ReadonlyArray<ProductAssignmentInput>;
  sourceProductId?: string | null;
  conversionPairs?: ReadonlyArray<ConversionPairInput> | null;
  sharedStock?: number;
  stockInput?: StockInput;
}) {
  assertUniqueActiveUnits(input.products);

  let variants: StockInputVariant[];
  if (input.conversionPairs && input.conversionPairs.length > 0) {
    if (!input.sourceProductId) throw new Error("SOURCE_PRODUCT_NOT_FOUND");
    variants = resolveMultipliersFromConversionPairs({
      variants: input.products,
      sourceProductId: input.sourceProductId,
      conversionPairs: input.conversionPairs,
    });
  } else {
    variants = input.assignments.map((assignment) => {
      const product = input.products.find(
        (candidate) => candidate.id === assignment.productId,
      );
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      if (
        assignment.unitMultiplierToBase === undefined ||
        assignment.unitMultiplierToBase === null ||
        !Number.isFinite(assignment.unitMultiplierToBase) ||
        assignment.unitMultiplierToBase <= 0
      ) {
        throw new Error("INVALID_MULTIPLIER");
      }
      return {
        id: product.id,
        unit: product.unit,
        stock: product.stock,
        unitMultiplierToBase: assignment.unitMultiplierToBase,
      };
    });
  }

  const sourceProduct = input.sourceProductId
    ? input.products.find((product) => product.id === input.sourceProductId)
    : null;
  const baseStock = input.sourceProductId
    ? resolveSourceBaseStock({
        sourceProductId: input.sourceProductId,
        variants,
      })
    : input.sharedStock !== undefined && input.stockInput
      ? resolveSharedBaseStock({
          sharedStock: input.sharedStock,
          stockInput: input.stockInput,
          variants,
        })
      : undefined;

  if (baseStock === undefined || !Number.isFinite(baseStock)) {
    throw new Error("SHARED_STOCK_REQUIRED");
  }

  return {
    baseUnit: sourceProduct?.unit ?? null,
    baseStock,
    variants,
    conflictWarnings: input.sourceProductId
      ? buildStockConflictWarnings({
          sourceProductId: input.sourceProductId,
          baseStock,
          variants,
        })
      : [],
    conversionPairs: buildConversionPairSummaries(variants),
  };
}

export function resolveConversionEdit(input: {
  mode: ConversionEditMode;
  currentBaseStock: number;
  currentBaseProductId?: string | null;
  baseProductId?: string | null;
  sourceProductId?: string | null;
  variants: ReadonlyArray<StockInputVariant>;
  conversionPairs?: ReadonlyArray<ConversionPairInput>;
  directMultipliers?: ReadonlyArray<DirectMultiplierInput>;
}) {
  if (input.mode === "PRESERVE_SOURCE_STOCK" && !input.sourceProductId) {
    throw new Error("SOURCE_PRODUCT_REQUIRED");
  }

  const products = input.variants.map((variant) => ({
    id: variant.id,
    unit: variant.unit ?? "",
    stock: input.currentBaseStock / variant.unitMultiplierToBase,
  }));
  const baseProductId =
    input.baseProductId ?? input.currentBaseProductId ?? input.variants[0]?.id ?? "";
  const variants =
    input.directMultipliers && input.directMultipliers.length > 0
      ? resolveMultipliersFromDirectAssignments({
          variants: products,
          baseProductId,
          directMultipliers: input.directMultipliers,
        })
      : resolveMultipliersFromConversionPairs({
          variants: products,
          sourceProductId: baseProductId,
          conversionPairs: input.conversionPairs ?? [],
        });

  const oldBaseProduct =
    input.currentBaseProductId && input.baseProductId !== input.currentBaseProductId
      ? input.variants.find((variant) => variant.id === input.baseProductId)
      : null;
  const nextBaseStock =
    input.mode === "PRESERVE_SOURCE_STOCK"
      ? resolveSourceBaseStock({
          sourceProductId: input.sourceProductId!,
          variants,
        })
      : oldBaseProduct
        ? input.currentBaseStock / oldBaseProduct.unitMultiplierToBase
        : input.currentBaseStock;

  return {
    baseProductId,
    nextBaseStock,
    variants,
    preview: input.variants.map((variant) => {
      const nextVariant = variants.find((candidate) => candidate.id === variant.id);
      return {
        productId: variant.id,
        unit: variant.unit,
        oldDisplayStock: input.currentBaseStock / variant.unitMultiplierToBase,
        newDisplayStock: nextVariant
          ? nextBaseStock / nextVariant.unitMultiplierToBase
          : input.currentBaseStock / variant.unitMultiplierToBase,
      };
    }),
  };
}

export function calculateVariantMargin(input: {
  price: number;
  costPrice?: number | null;
}) {
  const costPrice = input.costPrice ?? 0;
  const amount = input.price - costPrice;
  const percentage = input.price > 0 ? (amount / input.price) * 100 : 0;
  return {
    amount,
    percentage,
    warning: amount < 0 ? "NEGATIVE_MARGIN" : null,
    canSave: input.price >= 0 && costPrice >= 0,
  };
}

export function generateVariantSku(input: { sourceSku: string; unit: string }) {
  const trimmedSku = input.sourceSku.trim();
  const family = trimmedSku.includes("-")
    ? trimmedSku.slice(0, trimmedSku.lastIndexOf("-"))
    : trimmedSku;
  const suffix = input.unit.trim().replace(/\s+/g, "-").toUpperCase();
  return `${family}-${suffix}`;
}

export function resolveSharedBaseStock(input: {
  sharedStock: number;
  stockInput: StockInput;
  variants: StockInputVariant[];
}) {
  if (input.stockInput.mode === "BASE") return input.sharedStock;

  const variant = input.variants.find(
    (candidate) => candidate.id === input.stockInput.variantProductId,
  );
  if (!variant) throw new Error("VARIANT_NOT_FOUND");

  return input.sharedStock * variant.unitMultiplierToBase;
}

export function buildSharedStockInventoryLogRows(input: {
  groupDisplayName: string;
  oldBaseStock: number;
  newBaseStock: number;
  variants: StockInputVariant[];
  actor: { id: string; name?: string | null };
  note?: string | null;
}) {
  const note =
    input.note?.trim() ||
    `Manual shared stock update: ${input.groupDisplayName}`;

  return input.variants.map((variant) => ({
    productId: variant.id,
    type: "ADJUSTMENT" as const,
    reason: "MANUAL_ADJUSTMENT" as const,
    quantity: Math.abs(
      input.newBaseStock / variant.unitMultiplierToBase -
        input.oldBaseStock / variant.unitMultiplierToBase,
    ),
    note,
    createdBy: input.actor.id,
    person: input.actor.name ?? null,
  }));
}

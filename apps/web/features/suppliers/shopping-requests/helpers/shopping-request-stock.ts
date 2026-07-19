import {
  calculateBaseQuantity,
  calculateDisplayStock,
} from "@/features/product-stock-groups/stock-display";

import type { ShoppingRequestStockMode } from "../types/shopping-request";

export interface ShoppingStockProduct {
  id: string;
  name: string;
  sku: string;
  unit: string;
  stock: number;
  imageUrl?: string | null;
  stockGroupId?: string | null;
  unitMultiplierToBase: number;
  conversionNeedsReview: boolean;
}

export interface ShoppingStockGroup {
  id: string;
  displayName: string;
  baseUnit: string;
  baseStock: number;
  variants: ShoppingStockProduct[];
}

export interface ShoppingStockPreviewRowInput {
  itemId: string;
  productId: string;
  stockMode: ShoppingRequestStockMode;
  quantity: number;
}

export interface ShoppingStockGroupPreview {
  mode: "GROUP_STOCK";
  stockGroupId: string;
  displayName: string;
  baseUnit: string;
  beforeBaseStock: number;
  afterBaseStock: number;
  baseDelta: number;
  itemIds: string[];
  variants: Array<
    ShoppingStockProduct & { beforeStock: number; afterStock: number; delta: number }
  >;
}

export interface ShoppingProductStockPreview {
  mode: "PRODUCT_ONLY";
  itemId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  imageUrl: string | null;
  beforeStock: number;
  afterStock: number;
  delta: number;
}

export interface ShoppingRequestStockPreview {
  groupRows: ShoppingStockGroupPreview[];
  productRows: ShoppingProductStockPreview[];
}

function assertQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("INVALID_QUANTITY");
  }
}

function assertConversion(product: ShoppingStockProduct) {
  if (
    product.conversionNeedsReview ||
    !Number.isFinite(product.unitMultiplierToBase) ||
    product.unitMultiplierToBase <= 0
  ) {
    throw new Error("INVALID_CONVERSION");
  }
}

export function calculateShoppingRequestStockPreview(input: {
  rows: ShoppingStockPreviewRowInput[];
  products: ShoppingStockProduct[];
  groups: ShoppingStockGroup[];
}): ShoppingRequestStockPreview {
  if (input.rows.length === 0) throw new Error("EMPTY_ROWS");

  const productsById = new Map(input.products.map((product) => [product.id, product]));
  const groupsById = new Map(input.groups.map((group) => [group.id, group]));
  const seenItems = new Set<string>();
  const grouped = new Map<
    string,
    { group: ShoppingStockGroup; baseDelta: number; itemIds: string[] }
  >();
  const productRows: ShoppingProductStockPreview[] = [];

  for (const row of input.rows) {
    assertQuantity(row.quantity);
    if (seenItems.has(row.itemId)) throw new Error("DUPLICATE_ITEM");
    seenItems.add(row.itemId);

    const product = productsById.get(row.productId);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");

    if (row.stockMode === "GROUP_STOCK") {
      const group = product.stockGroupId
        ? groupsById.get(product.stockGroupId)
        : undefined;
      if (!group) throw new Error("GROUP_NOT_FOUND");
      assertConversion(product);
      group.variants.forEach(assertConversion);

      const current = grouped.get(group.id) ?? {
        group,
        baseDelta: 0,
        itemIds: [],
      };
      current.baseDelta += calculateBaseQuantity(
        row.quantity,
        product.unitMultiplierToBase,
      );
      current.itemIds.push(row.itemId);
      grouped.set(group.id, current);
      continue;
    }

    productRows.push({
      mode: "PRODUCT_ONLY",
      itemId: row.itemId,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unit: product.unit,
      imageUrl: product.imageUrl ?? null,
      beforeStock: product.stock,
      afterStock: product.stock + row.quantity,
      delta: row.quantity,
    });
  }

  const groupRows = Array.from(grouped.values()).map(
    ({ group, baseDelta, itemIds }): ShoppingStockGroupPreview => {
      const afterBaseStock = group.baseStock + baseDelta;
      return {
        mode: "GROUP_STOCK",
        stockGroupId: group.id,
        displayName: group.displayName,
        baseUnit: group.baseUnit,
        beforeBaseStock: group.baseStock,
        afterBaseStock,
        baseDelta,
        itemIds,
        variants: group.variants.map((variant) => {
          const beforeStock = calculateDisplayStock(
            group.baseStock,
            variant.unitMultiplierToBase,
          );
          const afterStock = calculateDisplayStock(
            afterBaseStock,
            variant.unitMultiplierToBase,
          );
          return {
            ...variant,
            beforeStock,
            afterStock,
            delta: afterStock - beforeStock,
          };
        }),
      };
    },
  );

  return { groupRows, productRows };
}

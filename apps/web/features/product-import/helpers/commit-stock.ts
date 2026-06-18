import { calculateDisplayStock } from "@/features/product-stock-groups/stock-display";
import type { ProductImportCommitAction } from "./commit-actions";

export interface ImportCreateStockPlanInput {
  commitAction: ProductImportCommitAction;
  rowStock: number;
  stockProvided?: boolean;
  multiplier: number;
  matchedGroupBaseStock?: number | null;
}

export interface ImportCreateStockPlan {
  productStock: number;
  groupBaseStock: number;
  inventoryLogQuantity: number | null;
}

export function resolveImportCreateStockPlan(
  input: ImportCreateStockPlanInput,
): ImportCreateStockPlan {
  if (input.commitAction === "create-variant") {
    const groupBaseStock = Number(input.matchedGroupBaseStock ?? 0);
    return {
      productStock: calculateDisplayStock(groupBaseStock, input.multiplier),
      groupBaseStock,
      inventoryLogQuantity: null,
    };
  }

  const rowStock = Number.isFinite(input.rowStock) ? input.rowStock : 0;
  return {
    productStock: rowStock,
    groupBaseStock: rowStock * input.multiplier,
    inventoryLogQuantity:
      input.stockProvided && rowStock !== 0 ? Math.abs(rowStock) : null,
  };
}

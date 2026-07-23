import type {
  ApproveShoppingRequestIndividualItemInput,
  ApproveShoppingRequestInput,
  SaveShoppingRequestApprovedQuantitiesInput,
  ShoppingRequestStockMode,
} from "../types/shopping-request";

export interface InlineApprovalItem {
  id: string;
  approvedQty: number;
  stockMode: ShoppingRequestStockMode;
}

export interface InlineApprovalActions {
  saveQuantities: (args: {
    id: string;
    input: SaveShoppingRequestApprovedQuantitiesInput;
  }) => Promise<unknown>;
  approveItem: (args: {
    id: string;
    itemId: string;
    input: ApproveShoppingRequestIndividualItemInput;
  }) => Promise<unknown>;
  approveAll: (args: {
    id: string;
    input: ApproveShoppingRequestInput;
  }) => Promise<unknown>;
}

interface InlineApprovalInput {
  requestId: string;
  canSetApprovedQty: boolean;
  confirmOverRequested: boolean;
}

interface InlineItemApprovalInput extends InlineApprovalInput {
  item: InlineApprovalItem;
}

interface InlineAllApprovalInput extends InlineApprovalInput {
  items: InlineApprovalItem[];
}

export function parseApprovedQuantity(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function approveShoppingRequestItemWithQuantity(
  input: InlineItemApprovalInput,
  actions: InlineApprovalActions,
) {
  if (input.canSetApprovedQty) {
    await actions.saveQuantities({
      id: input.requestId,
      input: {
        items: [
          {
            id: input.item.id,
            approvedQty: input.item.approvedQty,
          },
        ],
        confirmOverRequested: input.confirmOverRequested,
      },
    });
  }

  await actions.approveItem({
    id: input.requestId,
    itemId: input.item.id,
    input: {
      stockMode: input.item.stockMode,
      confirmOverRequested: input.confirmOverRequested,
    },
  });
}

export async function approveAllShoppingRequestItemsWithQuantities(
  input: InlineAllApprovalInput,
  actions: InlineApprovalActions,
) {
  if (input.canSetApprovedQty) {
    await actions.saveQuantities({
      id: input.requestId,
      input: {
        items: input.items.map((item) => ({
          id: item.id,
          approvedQty: item.approvedQty,
        })),
        confirmOverRequested: input.confirmOverRequested,
      },
    });
  }

  await actions.approveAll({
    id: input.requestId,
    input: {
      items: input.items.map((item) => ({
        id: item.id,
        stockMode: item.stockMode,
      })),
      confirmOverRequested: input.confirmOverRequested,
    },
  });
}

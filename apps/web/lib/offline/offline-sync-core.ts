import {
  type OfflineCartItem,
  calculateStockAdjustment,
  isExpiredOfflineTransaction,
} from "./offline-core";
import { discountedLineSubtotal } from "../../features/pos-checkout/helpers/item-discount";
import { calculateTransactionTax } from "../../features/transaction-tax/helpers/tax-calculation";

export type OfflineSyncPayload = {
  clientMutationId: string;
  createdAt: string;
  items: OfflineCartItem[];
  discount: number;
  taxRate?: number;
  originalTotal: number;
};

export type OfflineSyncDecision = {
  resultStatus: "SYNCED" | "PENDING_APPROVAL" | "FAILED_FINAL";
  transactionStatus: "COMPLETED" | "PENDING_APPROVAL" | null;
  reason: "UNCHANGED" | "ADJUSTED_TOTAL_CHANGED" | "EXPIRED" | "NO_ITEMS_AVAILABLE";
  items: OfflineCartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  removedItems: ReturnType<typeof calculateStockAdjustment>["removedItems"];
};

export function buildOfflineSyncDecision(
  payload: OfflineSyncPayload,
  context: {
    now: Date;
    stockByProductId: Map<string, number>;
  },
): OfflineSyncDecision {
  const adjustment = calculateStockAdjustment(
    payload.items,
    context.stockByProductId,
  );

  if (adjustment.status === "REJECTED_EMPTY") {
    return {
      resultStatus: "FAILED_FINAL",
      transactionStatus: null,
      reason: "NO_ITEMS_AVAILABLE",
      items: [],
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      removedItems: adjustment.removedItems,
    };
  }

  const subtotal = Math.round(adjustment.items.reduce(
    (sum, item) => sum + discountedLineSubtotal(item.price, item.quantity, item.discount),
    0,
  ) * 100) / 100;
  const discount = Math.min(payload.discount, subtotal);
  const { tax, total } = calculateTransactionTax({ subtotal, discount, taxRate: payload.taxRate ?? 0, taxMethod: "STANDARD" });
  const expired = isExpiredOfflineTransaction(payload.createdAt, context.now);
  const totalChanged = total !== payload.originalTotal || adjustment.totalChanged;

  if (expired) {
    return {
      resultStatus: "PENDING_APPROVAL",
      transactionStatus: "PENDING_APPROVAL",
      reason: "EXPIRED",
      items: adjustment.items,
      subtotal,
      discount,
      tax,
      total,
      removedItems: adjustment.removedItems,
    };
  }

  if (totalChanged) {
    return {
      resultStatus: "PENDING_APPROVAL",
      transactionStatus: "PENDING_APPROVAL",
      reason: "ADJUSTED_TOTAL_CHANGED",
      items: adjustment.items,
      subtotal,
      discount,
      tax,
      total,
      removedItems: adjustment.removedItems,
    };
  }

  return {
    resultStatus: "SYNCED",
    transactionStatus: "COMPLETED",
    reason: "UNCHANGED",
    items: adjustment.items,
    subtotal,
    discount,
    tax,
    total,
    removedItems: adjustment.removedItems,
  };
}

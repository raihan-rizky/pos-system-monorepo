import {
  type OfflineCartItem,
  calculateStockAdjustment,
  isExpiredOfflineTransaction,
} from "./offline-core";

export type OfflineSyncPayload = {
  clientMutationId: string;
  createdAt: string;
  items: OfflineCartItem[];
  discount: number;
  originalTotal: number;
};

export type OfflineSyncDecision = {
  resultStatus: "SYNCED" | "PENDING_APPROVAL" | "FAILED_FINAL";
  transactionStatus: "COMPLETED" | "PENDING_APPROVAL" | null;
  reason: "UNCHANGED" | "ADJUSTED_TOTAL_CHANGED" | "EXPIRED" | "NO_ITEMS_AVAILABLE";
  items: OfflineCartItem[];
  subtotal: number;
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
      total: 0,
      removedItems: adjustment.removedItems,
    };
  }

  const subtotal = adjustment.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const total = Math.max(0, subtotal - payload.discount);
  const expired = isExpiredOfflineTransaction(payload.createdAt, context.now);
  const totalChanged = total !== payload.originalTotal || adjustment.totalChanged;

  if (expired) {
    return {
      resultStatus: "PENDING_APPROVAL",
      transactionStatus: "PENDING_APPROVAL",
      reason: "EXPIRED",
      items: adjustment.items,
      subtotal,
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
    total,
    removedItems: adjustment.removedItems,
  };
}

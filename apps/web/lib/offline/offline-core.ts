export const OFFLINE_QUEUE_LIMIT = 500;
export const OFFLINE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export type OfflineSyncState =
  | "PENDING_SYNC"
  | "SYNCING"
  | "SYNCED"
  | "PENDING_APPROVAL"
  | "FAILED_RETRYABLE"
  | "FAILED_FINAL";

export type OfflineCartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  size?: string | null;
  material?: string | null;
};

export type RemovedOfflineItem = {
  productId: string;
  name: string;
  requestedQuantity: number;
  availableQuantity: number;
  removedQuantity: number;
};

export type StockAdjustmentResult =
  | {
      status: "UNCHANGED" | "ADJUSTED";
      items: OfflineCartItem[];
      removedItems: RemovedOfflineItem[];
      totalChanged: boolean;
    }
  | {
      status: "REJECTED_EMPTY";
      items: [];
      removedItems: RemovedOfflineItem[];
      totalChanged: true;
    };

export type OfflineQueueRecord = {
  clientMutationId: string;
  status: OfflineSyncState;
  retryCount: number;
  createdAt: string;
  serverTransactionId?: string | null;
  lastError?: string | null;
  syncedAt?: string | null;
};

export type OfflineSyncResult = {
  status: Exclude<OfflineSyncState, "PENDING_SYNC" | "SYNCING">;
  serverTransactionId?: string | null;
  message?: string | null;
};

export function isExpiredOfflineTransaction(
  createdAt: string,
  now = new Date(),
) {
  return now.getTime() - new Date(createdAt).getTime() > OFFLINE_EXPIRY_MS;
}

export function calculateStockAdjustment(
  items: OfflineCartItem[],
  availableStockByProductId: Map<string, number>,
): StockAdjustmentResult {
  const adjustedItems: OfflineCartItem[] = [];
  const removedItems: RemovedOfflineItem[] = [];

  for (const item of items) {
    const availableQuantity = Math.max(
      0,
      availableStockByProductId.get(item.productId) ?? 0,
    );
    const adjustedQuantity = Math.min(item.quantity, availableQuantity);

    if (adjustedQuantity > 0) {
      adjustedItems.push({ ...item, quantity: adjustedQuantity });
    }

    if (adjustedQuantity !== item.quantity) {
      removedItems.push({
        productId: item.productId,
        name: item.name,
        requestedQuantity: item.quantity,
        availableQuantity,
        removedQuantity: item.quantity - adjustedQuantity,
      });
    }
  }

  if (adjustedItems.length === 0) {
    return {
      status: "REJECTED_EMPTY",
      items: [],
      removedItems,
      totalChanged: true,
    };
  }

  return {
    status: removedItems.length > 0 ? "ADJUSTED" : "UNCHANGED",
    items: adjustedItems,
    removedItems,
    totalChanged: removedItems.length > 0,
  };
}

export function applySyncResult(
  record: OfflineQueueRecord,
  result: OfflineSyncResult,
  now = new Date(),
): OfflineQueueRecord {
  if (result.status === "FAILED_RETRYABLE") {
    return {
      ...record,
      status: result.status,
      retryCount: record.retryCount + 1,
      lastError: result.message || "Retryable sync failure",
    };
  }

  return {
    ...record,
    status: result.status,
    serverTransactionId: result.serverTransactionId ?? record.serverTransactionId ?? null,
    lastError:
      result.status === "FAILED_FINAL"
        ? result.message || "Final sync failure"
        : null,
    syncedAt:
      result.status === "SYNCED" || result.status === "PENDING_APPROVAL"
        ? now.toISOString()
        : record.syncedAt ?? null,
  };
}

export function buildClientMutationId(
  date = new Date(),
  random = () => Math.random().toString(36).slice(2, 10),
) {
  return `offline-${date.toISOString().replace(/\D/g, "")}-${random()}`;
}

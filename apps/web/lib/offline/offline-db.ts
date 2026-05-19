"use client";

import Dexie, { type Table } from "dexie";
import {
  OFFLINE_QUEUE_LIMIT,
  type OfflineCartItem,
  type OfflineSyncState,
  buildClientMutationId,
} from "./offline-core";

export type OfflinePaymentMethod = "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER";

export type OfflineTransactionPayload = {
  items: OfflineCartItem[];
  paymentMethod: OfflinePaymentMethod;
  amountPaid: number;
  discount: number;
  note?: string | null;
  customerName?: string | null;
  customerId?: string | null;
  salesName?: string | null;
  salespersonId?: string | null;
  paymentStatus?: string;
  isJobOrder?: boolean;
  estimatedDoneAt?: string | null;
  originalSubtotal: number;
  originalTotal: number;
};

export type OfflineTransactionRecord = {
  clientMutationId: string;
  status: OfflineSyncState;
  payload: OfflineTransactionPayload;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  lastError: string | null;
  serverTransactionId: string | null;
  syncResult: unknown | null;
  syncedAt: string | null;
};

export type SyncAttemptRecord = {
  id?: number;
  clientMutationId: string;
  status: OfflineSyncState;
  message: string | null;
  createdAt: string;
};

export type OfflineShiftRecord = {
  id: string;
  cashierId: string;
  storeId: string;
  openingBalance: number;
  closingBalance: number | null;
  expectedBalance: number | null;
  discrepancy: number | null;
  status: "OPEN" | "CLOSED";
  note: string | null;
  openedAt: string;
  closedAt: string | null;
  cashier?: { name: string };
  isLocalOnly: true;
};

export class PosOfflineDatabase extends Dexie {
  offlineTransactions!: Table<OfflineTransactionRecord, string>;
  syncAttempts!: Table<SyncAttemptRecord, number>;
  catalogProducts!: Table<Record<string, unknown> & { id: string; updatedAt: string }, string>;
  catalogCategories!: Table<Record<string, unknown> & { id: string; order?: number }, string>;
  offlineShifts!: Table<OfflineShiftRecord, string>;

  constructor() {
    super("pos-offline-pwa");

    this.version(1).stores({
      offlineTransactions:
        "&clientMutationId,status,createdAt,updatedAt,syncedAt",
      syncAttempts: "++id,clientMutationId,status,createdAt",
      catalogProducts: "&id,sku,categoryId,updatedAt",
      catalogCategories: "&id,order",
      salespersons: "&id,isActive",
      cachedCustomers: "&id,phone,updatedAt",
      notificationSubscriptions: "&endpoint,userId,role,storeId,updatedAt",
    });

    this.version(2).stores({
      offlineTransactions:
        "&clientMutationId,status,createdAt,updatedAt,syncedAt",
      syncAttempts: "++id,clientMutationId,status,createdAt",
      catalogProducts: "&id,sku,categoryId,updatedAt",
      catalogCategories: "&id,order",
      salespersons: "&id,isActive",
      cachedCustomers: "&id,phone,updatedAt",
      notificationSubscriptions: "&endpoint,userId,role,storeId,updatedAt",
      offlineShifts: "&id,status,openedAt,closedAt",
    });
  }
}

export const offlineDb = new PosOfflineDatabase();

export async function createOfflineTransaction(
  payload: OfflineTransactionPayload,
  now = new Date(),
) {
  const pendingCount = await offlineDb.offlineTransactions
    .where("status")
    .anyOf(["PENDING_SYNC", "SYNCING", "FAILED_RETRYABLE"])
    .count();

  if (pendingCount >= OFFLINE_QUEUE_LIMIT) {
    throw new Error("Offline queue limit reached. Sync before creating more offline transactions.");
  }

  const timestamp = now.toISOString();
  const record: OfflineTransactionRecord = {
    clientMutationId: buildClientMutationId(now),
    status: "PENDING_SYNC",
    payload,
    createdAt: timestamp,
    updatedAt: timestamp,
    retryCount: 0,
    lastError: null,
    serverTransactionId: null,
    syncResult: null,
    syncedAt: null,
  };

  await offlineDb.offlineTransactions.add(record);
  window.dispatchEvent(new CustomEvent("pos-offline-queue-changed"));
  return record;
}

export async function getOfflineQueueSummary() {
  const [pending, syncing, failed, pendingApproval] = await Promise.all([
    offlineDb.offlineTransactions
      .where("status")
      .anyOf(["PENDING_SYNC", "FAILED_RETRYABLE"])
      .count(),
    offlineDb.offlineTransactions.where("status").equals("SYNCING").count(),
    offlineDb.offlineTransactions
      .where("status")
      .anyOf(["FAILED_RETRYABLE", "FAILED_FINAL"])
      .count(),
    offlineDb.offlineTransactions
      .where("status")
      .equals("PENDING_APPROVAL")
      .count(),
  ]);

  const lastSynced = await offlineDb.offlineTransactions
    .where("syncedAt")
    .above("")
    .reverse()
    .first();

  return {
    pending,
    syncing,
    failed,
    pendingApproval,
    lastSyncAt: lastSynced?.syncedAt || null,
  };
}

export async function clearSyncedOfflineTransactions() {
  await offlineDb.offlineTransactions
    .where("status")
    .anyOf(["SYNCED", "PENDING_APPROVAL", "FAILED_FINAL"])
    .delete();
  window.dispatchEvent(new CustomEvent("pos-offline-queue-changed"));
}

export async function cacheCatalogProducts<T extends { id: string }>(products: T[]) {
  const updatedAt = new Date().toISOString();
  await offlineDb.catalogProducts.bulkPut(
    products.map((product) => ({ ...product, updatedAt })),
  );
}

export async function getCachedCatalogProducts<T>(
  search?: string,
  categoryId?: string,
  inStockOnly = false,
) {
  const all = (await offlineDb.catalogProducts.toArray()) as T[];
  const { parseSearchQuery, matchesSearchTokens } = await import(
    "@/features/pos-search/pos-search"
  );
  const { matchesStockFilter } = await import(
    "@/features/pos-search/pos-stock-filter"
  );
  const tokens = parseSearchQuery(search);

  return all.filter((product) => {
    const item = product as {
      name?: string;
      sku?: string;
      barcode?: string;
      stock?: number;
      category?: { id?: string };
    };
    const matchesCategory = categoryId ? item.category?.id === categoryId : true;
    if (!matchesCategory) return false;
    if (!matchesStockFilter({ stock: item.stock }, inStockOnly)) return false;
    return matchesSearchTokens(
      { name: item.name, sku: item.sku, barcode: item.barcode },
      tokens,
    );
  });
}

export async function cacheCatalogCategories<T extends { id: string }>(categories: T[]) {
  await offlineDb.catalogCategories.bulkPut(categories);
}

export async function getCachedCatalogCategories<T>() {
  return (await offlineDb.catalogCategories.toArray()) as T[];
}

export async function getOfflineActiveShift() {
  return offlineDb.offlineShifts.where("status").equals("OPEN").first();
}

export async function createOfflineShift({
  openingBalance,
  note,
  cashierId = "offline-user",
  cashierName = "Offline cashier",
  storeId = "offline-store",
  now = new Date(),
}: {
  openingBalance: number;
  note?: string | null;
  cashierId?: string;
  cashierName?: string;
  storeId?: string;
  now?: Date;
}) {
  const existing = await getOfflineActiveShift();
  if (existing) return existing;

  const openedAt = now.toISOString();
  const shift: OfflineShiftRecord = {
    id: `offline-shift-${openedAt.replace(/\D/g, "")}`,
    cashierId,
    storeId,
    openingBalance,
    closingBalance: null,
    expectedBalance: null,
    discrepancy: null,
    status: "OPEN",
    note: note || null,
    openedAt,
    closedAt: null,
    cashier: { name: cashierName },
    isLocalOnly: true,
  };

  await offlineDb.offlineShifts.add(shift);
  window.dispatchEvent(new CustomEvent("pos-offline-shift-changed"));
  return shift;
}

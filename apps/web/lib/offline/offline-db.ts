"use client";

import Dexie, { type Table } from "dexie";
import {
  OFFLINE_QUEUE_LIMIT,
  type OfflineCartItem,
  type OfflineSyncState,
  buildClientMutationId,
} from "./offline-core";
import type { PricingPreference } from "@/features/customer-category-pricing/helpers/pricing-rules";
import type { PriceRoundingSettings } from "@/features/product-price-rounding/rounding";

export type OfflinePaymentMethod = "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER" | "TEMPO";

export type OfflineTransactionPayload = {
  originCashierId?: string;
  originStoreId?: string;
  shiftId?: string | null;
  timeSource?: "SERVER_ESTIMATE" | "DEVICE_UNVERIFIED";
  items: OfflineCartItem[];
  paymentMethod: OfflinePaymentMethod;
  amountPaid: number;
  payments?: { method: string; amount: number }[];
  discount: number;
  taxRate?: number;
  note?: string | null;
  customerName?: string | null;
  customerId?: string | null;
  salesName?: string | null;
  salespersonId?: string | null;
  paymentStatus?: string;
  isJobOrder?: boolean;
  estimatedDoneAt?: string | null;
  invoiceDate?: string;
  invoiceTime?: string | null;
  invoiceDateReason?: string | null;
  pricingPreference?: PricingPreference;
  priceRoundingSettings?: PriceRoundingSettings;
  originalSubtotal: number;
  originalTotal: number;
};

export type OfflineTransactionRecord = {
  clientMutationId: string;
  // The original online request is retained until its outcome is known. This
  // preserves fields and line types that the offline reconciliation API cannot replay.
  onlineRequest?: Record<string, unknown>;
  reconcileOffline?: boolean;
  status: OfflineSyncState;
  payload: OfflineTransactionPayload;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  lastError: string | null;
  serverTransactionId: string | null;
  syncResult: unknown | null;
  syncedAt: string | null;
  syncClaimId?: string | null;
  syncLeaseExpiresAt?: string | null;
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
  pausedAt: string | null;
  pausedDurationSeconds: number;
  cashier?: { name: string };
  isLocalOnly: true;
  openSynced?: boolean;
  closeSynced?: boolean;
  closeNote?: string | null;
  syncError?: string | null;
};

type OfflineSyncLock = { id: string; owner: string; expiresAt: number };
export type OfflineCatalogIdentity = { cashierId: string; storeId: string };
export type OfflineCatalogSnapshot = OfflineCatalogIdentity & {
  id: string;
  generatedAt: string;
  products: (Record<string, unknown> & { id: string })[];
  categories: (Record<string, unknown> & { id: string })[];
};

export class PosOfflineDatabase extends Dexie {
  offlineTransactions!: Table<OfflineTransactionRecord, string>;
  syncAttempts!: Table<SyncAttemptRecord, number>;
  catalogProducts!: Table<Record<string, unknown> & { id: string; updatedAt: string }, string>;
  catalogCategories!: Table<Record<string, unknown> & { id: string; order?: number }, string>;
  offlineShifts!: Table<OfflineShiftRecord, string>;
  syncLocks!: Table<OfflineSyncLock, string>;
  catalogSnapshots!: Table<OfflineCatalogSnapshot, string>;

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

    this.version(3).stores({ syncLocks: "&id" });
    this.version(4).stores({ catalogSnapshots: "&id" });
  }
}

export const offlineDb = new PosOfflineDatabase();

export async function createOfflineTransaction(
  payload: OfflineTransactionPayload,
  now = new Date(),
  clientMutationId = buildClientMutationId(now),
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
    clientMutationId,
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

export async function getOfflineQueueSummary(identity: { cashierId: string; storeId: string } | null) {
  if (!identity) return { pending: 0, syncing: 0, failed: 0, pendingApproval: 0, lastSyncAt: null };
  const belongsToCashier = (record: OfflineTransactionRecord) =>
    record.payload.originCashierId === identity.cashierId && record.payload.originStoreId === identity.storeId;
  const [pending, syncing, failed, pendingApproval] = await Promise.all([
    offlineDb.offlineTransactions
      .where("status")
      .anyOf(["PENDING_SYNC", "FAILED_RETRYABLE"])
      .filter(belongsToCashier)
      .count(),
    offlineDb.offlineTransactions.where("status").equals("SYNCING").filter(belongsToCashier).count(),
    offlineDb.offlineTransactions
      .where("status")
      .anyOf(["FAILED_RETRYABLE", "FAILED_FINAL"])
      .filter(belongsToCashier)
      .count(),
    offlineDb.offlineTransactions
      .where("status")
      .equals("PENDING_APPROVAL")
      .filter(belongsToCashier)
      .count(),
  ]);

  const lastSynced = await offlineDb.offlineTransactions
    .where("syncedAt")
    .above("")
    .reverse()
    .filter(belongsToCashier)
    .first();

  return {
    pending,
    syncing,
    failed,
    pendingApproval,
    lastSyncAt: lastSynced?.syncedAt || null,
  };
}

export async function clearSyncedOfflineTransactions(storeId: string) {
  await offlineDb.offlineTransactions
    .where("status")
    .anyOf(["SYNCED", "PENDING_APPROVAL"])
    .filter((record) => Boolean(record.serverTransactionId) && record.payload.originStoreId === storeId)
    .delete();
  window.dispatchEvent(new CustomEvent("pos-offline-queue-changed"));
}

export async function getOfflineQueueRecords() {
  return offlineDb.offlineTransactions.orderBy("createdAt").reverse().toArray();
}

export async function retryOfflineTransaction(
  clientMutationId: string,
  identity: { cashierId: string; storeId: string },
) {
  await offlineDb.transaction("rw", offlineDb.offlineTransactions, async () => {
    const record = await offlineDb.offlineTransactions.get(clientMutationId);
    if (!record || record.status !== "FAILED_FINAL" || record.serverTransactionId ||
        record.payload.originCashierId !== identity.cashierId || record.payload.originStoreId !== identity.storeId) {
      throw new Error("Transaksi ini tidak dapat dicoba ulang oleh kasir yang sedang masuk.");
    }
    await offlineDb.offlineTransactions.update(clientMutationId, {
      status: "PENDING_SYNC", lastError: null, updatedAt: new Date().toISOString(),
    });
  });
  window.dispatchEvent(new CustomEvent("pos-offline-queue-changed"));
}

export async function cacheCatalogProducts<T extends { id: string }>(
  products: T[],
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const updatedAt = new Date().toISOString();
  const rows = products.map((product) => ({ ...product, updatedAt }));
  if (!signal) {
    await offlineDb.catalogProducts.bulkPut(rows);
    return;
  }

  let cancelled = false;
  let removeAbortListener: (() => void) | undefined;
  try {
    await offlineDb.transaction("rw", offlineDb.catalogProducts, async (transaction) => {
      // Dexie may wrap a thrown DOMException; record this cancellation first.
      if (signal.aborted) cancelled = true;
      signal.throwIfAborted();
      const onAbort = () => {
        if (transaction.active) {
          transaction.abort();
          cancelled = true;
        }
      };
      signal.addEventListener("abort", onAbort);
      removeAbortListener = () => signal.removeEventListener("abort", onAbort);
      await offlineDb.catalogProducts.bulkPut(rows);
    });
  } catch (error) {
    if (cancelled) throw signal.reason;
    throw error;
  } finally {
    // bulkPut can resolve before commit. Keep cancellation until the transaction
    // settles; aborting after commit cannot undo an already persisted catalog.
    removeAbortListener?.();
  }
}

export async function getCachedCatalogProducts<T>(
  search?: string,
  categoryId?: string,
  inStockOnly = false,
  identity?: OfflineCatalogIdentity,
) {
  const snapshot = identity ? await offlineDb.catalogSnapshots.get(`${identity.cashierId}:${identity.storeId}`) : undefined;
  if (identity && (!snapshot || snapshot.cashierId !== identity.cashierId || snapshot.storeId !== identity.storeId)) {
    throw new Error("Katalog offline belum disiapkan untuk kasir ini. Hubungkan perangkat dan siapkan katalog.");
  }
  const all = (snapshot?.products ?? (await offlineDb.catalogProducts.toArray()).filter((product) =>
    !identity || product.storeId === identity.storeId,
  )) as T[];
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

export async function getCachedCatalogCategories<T>(identity?: OfflineCatalogIdentity) {
  const snapshot = identity ? await offlineDb.catalogSnapshots.get(`${identity.cashierId}:${identity.storeId}`) : undefined;
  if (identity && (!snapshot || snapshot.cashierId !== identity.cashierId || snapshot.storeId !== identity.storeId)) {
    throw new Error("Katalog offline belum disiapkan untuk kasir ini. Hubungkan perangkat dan siapkan katalog.");
  }
  return (snapshot?.categories ?? await offlineDb.catalogCategories.toArray()) as T[];
}

export async function getOfflineActiveShift(identity: { cashierId: string; storeId: string }) {
  return offlineDb.offlineShifts.where("status").equals("OPEN")
    .filter((shift) => shift.cashierId === identity.cashierId && shift.storeId === identity.storeId)
    .first();
}

export async function createOfflineShift({
  openingBalance,
  note,
  cashierId,
  cashierName = "Kasir",
  storeId,
  clientShiftId,
  now = new Date(),
}: {
  openingBalance: number;
  note?: string | null;
  cashierId: string;
  cashierName?: string;
  storeId: string;
  clientShiftId?: string;
  now?: Date;
}) {
  const existing = await getOfflineActiveShift({ cashierId, storeId });
  if (existing) return existing;

  const openedAt = now.toISOString();
  const shift: OfflineShiftRecord = {
    id: clientShiftId || `shift-${buildClientMutationId(now)}`,
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
    pausedAt: null,
    pausedDurationSeconds: 0,
    cashier: { name: cashierName },
    isLocalOnly: true,
    openSynced: false,
    closeSynced: false,
    syncError: null,
  };

  await offlineDb.offlineShifts.add(shift);
  window.dispatchEvent(new CustomEvent("pos-offline-shift-changed"));
  return shift;
}

export async function rememberActiveShift(shift: Omit<OfflineShiftRecord, "isLocalOnly">) {
  await offlineDb.transaction("rw", offlineDb.offlineShifts, async () => {
    const current = await offlineDb.offlineShifts.get(shift.id);
    // A local close must survive a stale server response while replay is pending.
    if (current?.status === "CLOSED" && !current.closeSynced) return;
    await offlineDb.offlineShifts.put({ ...shift, isLocalOnly: true, openSynced: true, closeSynced: false });
  });
}

export async function closeOfflineShift(
  shiftId: string,
  identity: { cashierId: string; storeId: string },
  closingBalance: number,
  note?: string,
) {
  if (!Number.isFinite(closingBalance) || closingBalance < 0) {
    throw new Error("Jumlah uang fisik tidak valid.");
  }
  await offlineDb.transaction("rw", offlineDb.offlineShifts, async () => {
    const shift = await offlineDb.offlineShifts.get(shiftId);
    if (!shift || shift.status !== "OPEN" || shift.cashierId !== identity.cashierId || shift.storeId !== identity.storeId) {
      throw new Error("Shift offline tidak ditemukan untuk kasir ini.");
    }
    await offlineDb.offlineShifts.update(shiftId, {
      status: "CLOSED",
      closingBalance,
      closedAt: new Date().toISOString(),
      closeNote: note || null,
      closeSynced: false,
      syncError: null,
    });
  });
  window.dispatchEvent(new CustomEvent("pos-offline-shift-changed"));
}

"use client";

import { OFFLINE_QUEUE_LIMIT } from "./offline-core";
import { offlineDb, type OfflineTransactionPayload, type OfflineTransactionRecord } from "./offline-db";

const LEASE_MS = 120_000;

export function resolveCheckoutShiftId(shift: { id: string; cashierId: string; isLocalOnly?: boolean } | null | undefined, cashierId: string) {
  return shift?.cashierId === cashierId ? shift.id : null;
}

/** Persist the full request before allowing the first network attempt. */
export async function submitCheckoutWithOutbox<T extends { id: string; status: string }>(
  payload: OfflineTransactionPayload,
  request: Record<string, unknown> & {
    clientMutationId: string;
    invoiceDate?: string;
    invoiceTime?: string | null;
    invoiceDateReason?: string | null;
  },
  send: () => Promise<T>,
  now = new Date(),
  canReconcileOffline = true,
): Promise<{ kind: "complete"; transaction: T } | { kind: "queued" } | { kind: "rejected"; message: string }> {
  const id = request.clientMutationId;
  const claimId = `checkout:${id}`;
  const timestamp = now.toISOString();
  const record: OfflineTransactionRecord = {
    clientMutationId: id, onlineRequest: request, reconcileOffline: canReconcileOffline,
    payload: { ...payload, invoiceDate: request.invoiceDate, invoiceTime: request.invoiceTime, invoiceDateReason: request.invoiceDateReason },
    status: "SYNCING",
    createdAt: timestamp, updatedAt: timestamp, retryCount: 0, lastError: null,
    serverTransactionId: null, syncResult: null, syncedAt: null, syncClaimId: claimId,
    syncLeaseExpiresAt: new Date(now.getTime() + LEASE_MS).toISOString(),
  };
  await offlineDb.transaction("rw", offlineDb.offlineTransactions, offlineDb.offlineShifts, async () => {
    if (payload.shiftId) {
      const shift = await offlineDb.offlineShifts.get(payload.shiftId);
      if (!shift || shift.status !== "OPEN" || shift.cashierId !== payload.originCashierId || shift.storeId !== payload.originStoreId) {
        throw new Error("Shift sudah ditutup atau tidak tersedia. Muat ulang POS sebelum melanjutkan.");
      }
    }
    const count = await offlineDb.offlineTransactions.where("status")
      .anyOf(["PENDING_SYNC", "SYNCING", "FAILED_RETRYABLE"]).count();
    if (count >= OFFLINE_QUEUE_LIMIT) {
      throw new Error("Antrean transaksi penuh. Sinkronkan transaksi sebelum melanjutkan.");
    }
    await offlineDb.offlineTransactions.add(record);
  });
  window.dispatchEvent(new CustomEvent("pos-offline-queue-changed"));

  const settle = async (changes: Partial<OfflineTransactionRecord>) => {
    await offlineDb.transaction("rw", offlineDb.offlineTransactions, async () => {
      const current = await offlineDb.offlineTransactions.get(id);
      if (current?.status !== "SYNCING" || current.syncClaimId !== claimId) return;
      await offlineDb.offlineTransactions.update(id, {
        ...changes, updatedAt: new Date().toISOString(), syncClaimId: null, syncLeaseExpiresAt: null,
      });
    });
    window.dispatchEvent(new CustomEvent("pos-offline-queue-changed"));
  };

  try {
    const transaction = await send();
    // A failed local update is safe: the lease expires and replay uses the same ID.
    await settle({
      status: transaction.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : "SYNCED",
      serverTransactionId: transaction.id, syncedAt: new Date().toISOString(), lastError: null,
    }).catch(() => undefined);
    return { kind: "complete", transaction };
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error
      ? Number(error.status) : 0;
    const message = error instanceof Error ? error.message : "Transaksi belum dapat diproses.";
    const rejected = status >= 400 && status < 500 && status !== 401 && status !== 429;
    await settle({
      status: rejected ? "FAILED_FINAL" : "PENDING_SYNC",
      lastError: message,
      ...(!rejected && canReconcileOffline ? { onlineRequest: undefined } : {}),
    }).catch(() => undefined);
    return rejected ? { kind: "rejected", message } : { kind: "queued" };
  }
}

"use client";

import { applySyncResult, buildClientMutationId } from "./offline-core";
import { offlineDb, type OfflineTransactionRecord } from "./offline-db";

type ServerSyncItemResult = {
  clientMutationId: string;
  status: "SYNCED" | "PENDING_APPROVAL" | "FAILED_RETRYABLE" | "FAILED_FINAL";
  serverTransactionId?: string | null;
  message?: string | null;
};

const SYNC_LEASE_MS = 2 * 60 * 1000;

export async function syncOfflineTransactions(
  identity: { cashierId: string; storeId: string },
  shiftId?: string | null,
) {
  const claimId = buildClientMutationId();
  const now = new Date();
  const candidates = await offlineDb.transaction("rw", offlineDb.offlineTransactions, async () => {
    const rows = await offlineDb.offlineTransactions
      .where("status")
      .anyOf(["PENDING_SYNC", "FAILED_RETRYABLE", "SYNCING"])
      .sortBy("createdAt");
    const eligible = rows.filter((record) => {
      if (record.payload.originCashierId !== identity.cashierId || record.payload.originStoreId !== identity.storeId) return false;
      if (shiftId !== undefined && (record.payload.shiftId ?? null) !== shiftId) return false;
      if (record.status !== "SYNCING") return true;
      const expiry = record.syncLeaseExpiresAt
        ? Date.parse(record.syncLeaseExpiresAt)
        : Date.parse(record.updatedAt) + SYNC_LEASE_MS;
      return !Number.isFinite(expiry) || expiry <= now.getTime();
    }).slice(0, 500);
    await Promise.all(eligible.map((record) =>
      offlineDb.offlineTransactions.update(record.clientMutationId, {
        status: "SYNCING",
        updatedAt: now.toISOString(),
        syncClaimId: claimId,
        syncLeaseExpiresAt: new Date(now.getTime() + SYNC_LEASE_MS).toISOString(),
      }),
    ));
    return eligible;
  });

  if (candidates.length === 0) {
    return { synced: 0, pendingApproval: 0, failed: 0 };
  }

  window.dispatchEvent(new CustomEvent("pos-offline-queue-changed"));

  const onlineCandidates = candidates.filter((record) => record.onlineRequest && !record.reconcileOffline);
  const offlineCandidates = candidates.filter((record) => !record.onlineRequest || record.reconcileOffline);
  const onlineTotals = { synced: 0, pendingApproval: 0, failed: 0 };
  for (const record of onlineCandidates) {
    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...record.onlineRequest,
          originCashierId: record.payload.originCashierId,
          originStoreId: record.payload.originStoreId,
          offlineReplay: { ...(record.payload.shiftId ? { shiftId: record.payload.shiftId } : {}), capturedAt: record.createdAt },
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body?.message || "Transaksi belum dapat diproses.";
        if (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 429) {
          const updated = await updateClaimed(record.clientMutationId, claimId, {
            status: "FAILED_FINAL", lastError: message, updatedAt: new Date().toISOString(),
          });
          if (updated) onlineTotals.failed++;
        } else {
          await markRetryable(record, claimId, message);
          onlineTotals.failed++;
        }
        continue;
      }
      if (!body || typeof body.id !== "string" || typeof body.status !== "string") {
        throw new Error("Respons transaksi belum lengkap. Sinkronisasi akan dicoba lagi.");
      }
      const status = body.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : "SYNCED";
      const updated = await updateClaimed(record.clientMutationId, claimId, {
        status, serverTransactionId: body.id, syncResult: body, lastError: null,
        syncedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      if (updated) {
        if (status === "PENDING_APPROVAL") onlineTotals.pendingApproval++;
        else onlineTotals.synced++;
      }
    } catch (error) {
      await markRetryable(record, claimId, error instanceof Error ? error.message : "Sinkronisasi belum berhasil.");
      onlineTotals.failed++;
    }
  }

  if (offlineCandidates.length === 0) {
    window.dispatchEvent(new CustomEvent("pos-offline-queue-changed"));
    return onlineTotals;
  }

  try {
    const response = await fetch("/api/offline-sync/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactions: offlineCandidates.map((record) => ({
          clientMutationId: record.clientMutationId,
          createdAt: record.createdAt,
          ...record.payload,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.message || "Offline sync failed");
    }

    const json = (await response.json()) as { results: ServerSyncItemResult[] };
    const byId = new Map(json.results.map((result) => [result.clientMutationId, result]));

    await Promise.all(
      offlineCandidates.map(async (record) => {
        const result = byId.get(record.clientMutationId);
        if (!result) {
          await markRetryable(record, claimId, "Server did not return a sync result");
          return;
        }

        const next = applySyncResult(record, result);
        const updated = await updateClaimed(record.clientMutationId, claimId, {
          status: next.status,
          retryCount: next.retryCount,
          lastError: next.lastError ?? null,
          serverTransactionId: next.serverTransactionId ?? null,
          syncResult: result,
          syncedAt: next.syncedAt ?? null,
          updatedAt: new Date().toISOString(),
        });
        if (!updated) return;
        await offlineDb.syncAttempts.add({
          clientMutationId: record.clientMutationId,
          status: next.status,
          message: result.message || null,
          createdAt: new Date().toISOString(),
        });
      }),
    );

    window.dispatchEvent(new CustomEvent("pos-offline-queue-changed"));
    return {
      synced: onlineTotals.synced + json.results.filter((result) => result.status === "SYNCED").length,
      pendingApproval: onlineTotals.pendingApproval + json.results.filter((result) => result.status === "PENDING_APPROVAL").length,
      failed: onlineTotals.failed + json.results.filter((result) => result.status.startsWith("FAILED")).length,
    };
  } catch (error) {
    await Promise.all(
      offlineCandidates.map((record) =>
        markRetryable(
          record,
          claimId,
          error instanceof Error ? error.message : "Offline sync failed",
        ),
      ),
    );
    window.dispatchEvent(new CustomEvent("pos-offline-queue-changed"));
    throw error;
  }
}

async function updateClaimed(id: string, claimId: string, changes: Partial<OfflineTransactionRecord>) {
  return offlineDb.transaction("rw", offlineDb.offlineTransactions, async () => {
    const current = await offlineDb.offlineTransactions.get(id);
    if (current?.status !== "SYNCING" || current.syncClaimId !== claimId) return false;
    await offlineDb.offlineTransactions.update(id, {
      ...changes,
      syncClaimId: null,
      syncLeaseExpiresAt: null,
    });
    return true;
  });
}

async function markRetryable(record: OfflineTransactionRecord, claimId: string, message: string) {
  const updated = await updateClaimed(record.clientMutationId, claimId, {
    status: "FAILED_RETRYABLE",
    retryCount: record.retryCount + 1,
    lastError: message,
    updatedAt: new Date().toISOString(),
  });
  if (!updated) return;
  await offlineDb.syncAttempts.add({
    clientMutationId: record.clientMutationId,
    status: "FAILED_RETRYABLE",
    message,
    createdAt: new Date().toISOString(),
  });
}

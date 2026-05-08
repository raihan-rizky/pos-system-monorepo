"use client";

import { applySyncResult } from "./offline-core";
import { offlineDb, type OfflineTransactionRecord } from "./offline-db";

type ServerSyncItemResult = {
  clientMutationId: string;
  status: "SYNCED" | "PENDING_APPROVAL" | "FAILED_RETRYABLE" | "FAILED_FINAL";
  serverTransactionId?: string | null;
  message?: string | null;
};

export async function syncOfflineTransactions() {
  const candidates = await offlineDb.offlineTransactions
    .where("status")
    .anyOf(["PENDING_SYNC", "FAILED_RETRYABLE"])
    .sortBy("createdAt");

  if (candidates.length === 0) {
    return { synced: 0, pendingApproval: 0, failed: 0 };
  }

  const now = new Date().toISOString();
  await offlineDb.transaction("rw", offlineDb.offlineTransactions, async () => {
    await Promise.all(
      candidates.map((record) =>
        offlineDb.offlineTransactions.update(record.clientMutationId, {
          status: "SYNCING",
          updatedAt: now,
        }),
      ),
    );
  });
  window.dispatchEvent(new CustomEvent("pos-offline-queue-changed"));

  try {
    const response = await fetch("/api/offline-sync/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactions: candidates.map((record) => ({
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
      candidates.map(async (record) => {
        const result = byId.get(record.clientMutationId);
        if (!result) {
          await markRetryable(record, "Server did not return a sync result");
          return;
        }

        const next = applySyncResult(record, result);
        await offlineDb.offlineTransactions.update(record.clientMutationId, {
          status: next.status,
          retryCount: next.retryCount,
          lastError: next.lastError ?? null,
          serverTransactionId: next.serverTransactionId ?? null,
          syncResult: result,
          syncedAt: next.syncedAt ?? null,
          updatedAt: new Date().toISOString(),
        });
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
      synced: json.results.filter((result) => result.status === "SYNCED").length,
      pendingApproval: json.results.filter((result) => result.status === "PENDING_APPROVAL").length,
      failed: json.results.filter((result) => result.status.startsWith("FAILED")).length,
    };
  } catch (error) {
    await Promise.all(
      candidates.map((record) =>
        markRetryable(
          record,
          error instanceof Error ? error.message : "Offline sync failed",
        ),
      ),
    );
    window.dispatchEvent(new CustomEvent("pos-offline-queue-changed"));
    throw error;
  }
}

async function markRetryable(record: OfflineTransactionRecord, message: string) {
  await offlineDb.offlineTransactions.update(record.clientMutationId, {
    status: "FAILED_RETRYABLE",
    retryCount: record.retryCount + 1,
    lastError: message,
    updatedAt: new Date().toISOString(),
  });
  await offlineDb.syncAttempts.add({
    clientMutationId: record.clientMutationId,
    status: "FAILED_RETRYABLE",
    message,
    createdAt: new Date().toISOString(),
  });
}

"use client";

import { buildClientMutationId } from "./offline-core";
import { offlineDb, type OfflineShiftRecord, type OfflineTransactionRecord } from "./offline-db";
import { syncOfflineTransactions } from "./offline-sync-client";

type Identity = { cashierId: string; storeId: string };
const LOCK_ID = "offline-work";
const LOCK_MS = 120_000;

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.message || "Sinkronisasi shift belum berhasil.");
  }
  return response.json();
}

function belongsTo(identity: Identity, record: OfflineTransactionRecord) {
  return record.payload.originCashierId === identity.cashierId && record.payload.originStoreId === identity.storeId;
}

function needsServer(record: OfflineTransactionRecord) {
  return !record.serverTransactionId && record.status !== "SYNCED";
}

async function markShiftError(shift: OfflineShiftRecord, error: unknown) {
  await offlineDb.offlineShifts.update(shift.id, {
    syncError: error instanceof Error ? error.message : "Sinkronisasi shift belum berhasil.",
  });
  window.dispatchEvent(new CustomEvent("pos-offline-shift-changed"));
}

/** Replay opens, sales and closes in order. The lease also coordinates browser tabs. */
export async function syncOfflineWork(identity: Identity) {
  const owner = buildClientMutationId();
  const acquired = await offlineDb.transaction("rw", offlineDb.syncLocks, async () => {
    const lock = await offlineDb.syncLocks.get(LOCK_ID);
    if (lock && lock.expiresAt > Date.now()) return false;
    await offlineDb.syncLocks.put({ id: LOCK_ID, owner, expiresAt: Date.now() + LOCK_MS });
    return true;
  });
  if (!acquired) return { synced: 0, pendingApproval: 0, failed: 0 };

  let ownsLease = true;
  const renew = async () => {
    await offlineDb.transaction("rw", offlineDb.syncLocks, async () => {
      const lock = await offlineDb.syncLocks.get(LOCK_ID);
      if (lock?.owner !== owner) { ownsLease = false; return; }
      await offlineDb.syncLocks.update(LOCK_ID, { expiresAt: Date.now() + LOCK_MS });
    });
  };
  const timer = window.setInterval(() => { void renew().catch(() => { ownsLease = false; }); }, LOCK_MS / 3);
  const assertLease = async () => {
    await renew();
    if (!ownsLease) throw new Error("Sinkronisasi sedang dilanjutkan di tab lain.");
  };
  const totals = { synced: 0, pendingApproval: 0, failed: 0 };
  const syncBatch = async (shiftId: string | null) => {
    await assertLease();
    const result = await syncOfflineTransactions(identity, shiftId);
    totals.synced += result.synced;
    totals.pendingApproval += result.pendingApproval;
    totals.failed += result.failed;
  };

  try {
    // Old queue entries may not name a shift. Save them first; timestamp bounds
    // on shift close keep later sales out of earlier shift summaries.
    await syncBatch(null);
    const shifts = (await offlineDb.offlineShifts.orderBy("openedAt").toArray())
      .filter((shift) => shift.cashierId === identity.cashierId && shift.storeId === identity.storeId && !shift.closeSynced);

    for (const original of shifts) {
      await assertLease();
      let shift = await offlineDb.offlineShifts.get(original.id);
      if (!shift) continue;
      try {
        if (!shift.openSynced) {
          await postJson("/api/shifts", {
            clientShiftId: shift.id, openedAt: shift.openedAt,
            openingBalance: shift.openingBalance, note: shift.note,
            originCashierId: shift.cashierId, originStoreId: shift.storeId,
          });
          await assertLease();
          await offlineDb.offlineShifts.update(shift.id, { openSynced: true, syncError: null });
        }

        await syncBatch(shift.id);
        shift = await offlineDb.offlineShifts.get(shift.id);
        if (!shift) continue;
        const unresolved = (await offlineDb.offlineTransactions.toArray()).filter((record) => {
          if (!belongsTo(identity, record) || !needsServer(record)) return false;
          if (record.payload.shiftId === shift!.id) return true;
          // Entries created before shift IDs were stored still block close if
          // their timestamp falls inside this local shift.
          return !record.payload.shiftId && record.createdAt >= shift!.openedAt &&
            (!shift!.closedAt || record.createdAt <= shift!.closedAt);
        });
        if (unresolved.length) throw new Error("Ada transaksi shift yang belum tersimpan di server. Periksa antrean transaksi.");

        if (shift.status === "CLOSED" && shift.closedAt && shift.closingBalance !== null) {
          await assertLease();
          await postJson("/api/shifts/close", {
            shiftId: shift.id, closingBalance: shift.closingBalance,
            note: shift.closeNote, closedAt: shift.closedAt,
          });
          await assertLease();
          await offlineDb.offlineShifts.update(shift.id, { closeSynced: true, syncError: null });
        } else {
          // A later shift cannot be opened on the server until this one closes.
          break;
        }
      } catch (error) {
        await markShiftError(shift ?? original, error);
        throw error;
      }
    }

    const unknown = (await offlineDb.offlineTransactions.toArray()).find((record) =>
      belongsTo(identity, record) && needsServer(record) && record.payload.shiftId &&
      !shifts.some((shift) => shift.id === record.payload.shiftId),
    );
    if (unknown) throw new Error("Data shift transaksi tidak tersedia di perangkat ini. Hubungi pengelola.");
    return totals;
  } finally {
    window.clearInterval(timer);
    await offlineDb.transaction("rw", offlineDb.syncLocks, async () => {
      const lock = await offlineDb.syncLocks.get(LOCK_ID);
      if (lock?.owner === owner) await offlineDb.syncLocks.delete(LOCK_ID);
    });
    window.dispatchEvent(new CustomEvent("pos-offline-shift-changed"));
  }
}

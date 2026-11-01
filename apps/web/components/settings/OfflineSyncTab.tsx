"use client";

import { RefreshCw, Trash2, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { formatRupiah } from "@/lib/utils";
import { useRole } from "@/components/providers/RoleProvider";
import { OfflineRecovery, exportOfflineRecord } from "./OfflineRecovery";
import { OfflineAccessPreparation } from "./OfflineAccessPreparation";

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Tunai", DEBIT: "Debit", CREDIT: "Kredit", QRIS: "QRIS",
  TRANSFER: "Transfer", TEMPO: "Tempo",
};

export default function OfflineSyncTab({ ownOnly = false }: { ownOnly?: boolean }) {
  const { role } = useRole();
  const { isOnline, isSyncing, error, syncNow, clearSynced, records, shifts, retryRecord, currentIdentity } = useOfflineSync();
  const visibleRecords = records.filter((record) => currentIdentity &&
    record.payload.originStoreId === currentIdentity.storeId && (!ownOnly || record.payload.originCashierId === currentIdentity.cashierId));
  const visibleShifts = shifts.filter((shift) => currentIdentity &&
    shift.storeId === currentIdentity.storeId && (!ownOnly || shift.cashierId === currentIdentity.cashierId));
  const pendingShifts = visibleShifts.filter((shift) => !shift.openSynced || (shift.status === "CLOSED" && !shift.closeSynced));
  const displaySummary = {
    pending: visibleRecords.filter((record) => record.status === "PENDING_SYNC" || record.status === "FAILED_RETRYABLE").length,
    syncing: visibleRecords.filter((record) => record.status === "SYNCING").length,
    failed: visibleRecords.filter((record) => record.status === "FAILED_RETRYABLE" || record.status === "FAILED_FINAL").length,
    pendingApproval: visibleRecords.filter((record) => record.status === "PENDING_APPROVAL").length,
    lastSyncAt: visibleRecords.map((record) => record.syncedAt).filter(Boolean).sort().at(-1) ?? null,
  };
  const [catalogTime, setCatalogTime] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [preparingCatalog, setPreparingCatalog] = useState(false);
  const cashierId = currentIdentity?.cashierId;
  const storeId = currentIdentity?.storeId;

  useEffect(() => {
    let active = true;
    if (!cashierId || !storeId) { setCatalogTime(null); return; }
    void import("@/lib/offline/offline-db").then(async ({ offlineDb }) => {
      const snapshot = await offlineDb.catalogSnapshots.get(`${cashierId}:${storeId}`);
      if (active) setCatalogTime(snapshot?.generatedAt ?? null);
    }).catch(() => { if (active) setCatalogTime(null); });
    return () => { active = false; };
  }, [cashierId, storeId]);

  const prepareCatalog = async () => {
    if (!cashierId || !storeId) return;
    setPreparingCatalog(true);
    setCatalogError(null);
    try {
      const { prepareOfflineCatalog } = await import("@/lib/offline/offline-catalog-preparation");
      const snapshot = await prepareOfflineCatalog({ cashierId, storeId });
      setCatalogTime(snapshot.generatedAt);
      if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
    } catch (prepareError) {
      setCatalogError(prepareError instanceof Error ? prepareError.message : "Katalog belum dapat disiapkan.");
    } finally {
      setPreparingCatalog(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-surface-900">Offline Sync</h2>
        <p className="mt-1 text-sm text-surface-500">
          Kelola transaksi offline yang tersimpan di perangkat ini.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Pending" value={displaySummary.pending} />
        <Metric label="Syncing" value={displaySummary.syncing} />
        <Metric label="Gagal" value={displaySummary.failed} tone="danger" />
        <Metric label="Approval" value={displaySummary.pendingApproval} />
      </div>

      <section aria-labelledby="offline-catalog-heading" className="space-y-2 rounded-lg border border-surface-200 bg-white p-4">
        <h3 id="offline-catalog-heading" className="font-bold text-surface-900">Katalog di perangkat</h3>
        <p className="text-sm text-surface-600">
          {catalogTime ? `Katalog disiapkan ${new Date(catalogTime).toLocaleString("id-ID")}.` : "Katalog lengkap belum disiapkan untuk kasir ini."}
          {" "}Siapkan ulang saat online agar harga dan stok diperbarui.
        </p>
        {catalogError && <p role="alert" className="text-sm text-danger-600">{catalogError}</p>}
        <button type="button" onClick={() => void prepareCatalog()} disabled={!isOnline || !cashierId || preparingCatalog}
          className="min-h-10 rounded-lg border border-brand-300 px-3 text-sm font-semibold text-brand-700 disabled:opacity-50">
          {preparingCatalog ? "Menyiapkan katalog..." : "Siapkan katalog offline"}
        </button>
      </section>

      <OfflineAccessPreparation identity={currentIdentity} isOnline={isOnline} onCatalogPrepared={setCatalogTime} />

      <div className="rounded-lg border border-surface-100 bg-surface-50 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-600">
              <Wifi className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-surface-900">
                Status: {isOnline ? "Online" : "Offline"}
              </p>
              <p className="text-xs text-surface-500">
                Sync terakhir: {displaySummary.lastSyncAt ? new Date(displaySummary.lastSyncAt).toLocaleString("id-ID") : "-"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={!isOnline || isSyncing || (displaySummary.pending === 0 && pendingShifts.length === 0)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            Sync sekarang
          </button>
        </div>
        {error && <p className="mt-3 text-sm font-medium text-danger-600">{error}</p>}
      </div>

      {!ownOnly && role === "OWNER" && currentIdentity && <OfflineRecovery records={records} shifts={shifts} storeId={currentIdentity.storeId} />}
      <section aria-labelledby="offline-records-heading" className="space-y-3">
        <h3 id="offline-records-heading" className="text-base font-bold text-surface-900">Transaksi di perangkat ini</h3>
        {exportError && <p role="alert" className="text-sm text-danger-600">{exportError}</p>}
        {!ownOnly && records.some((record) => !record.payload.originStoreId) && (
          <p className="text-sm text-amber-700">Perangkat ini memiliki transaksi lama tanpa identitas toko. Hubungi pengelola untuk pemulihan.</p>
        )}
        {visibleRecords.length === 0 && <p className="text-sm text-surface-500">Belum ada transaksi offline di perangkat ini.</p>}
        {visibleRecords.map((record) => {
          const originKnown = Boolean(record.payload.originCashierId && record.payload.originStoreId);
          const canRetry = record.status === "FAILED_FINAL" && !record.serverTransactionId &&
            record.payload.originCashierId === currentIdentity?.cashierId &&
            record.payload.originStoreId === currentIdentity?.storeId;
          return (
            <details key={record.clientMutationId} className="rounded-lg border border-surface-200 bg-white p-3">
              <summary className="cursor-pointer text-sm font-semibold text-surface-900">
                {record.clientMutationId} · {record.status} · {formatRupiah(record.payload.originalTotal)}
              </summary>
              <div className="mt-3 space-y-2 text-sm text-surface-700">
                <p>Dibuat: {new Date(record.createdAt).toLocaleString("id-ID")}</p>
                <p>Kasir asal: {record.payload.originCashierId || "Tidak diketahui"}</p>
                {record.lastError && <p className="text-danger-600">{record.lastError}</p>}
                {!originKnown && <p>Identitas asal belum tercatat. Periksa transaksi bersama pengelola sebelum mencatat ulang.</p>}
                {typeof record.payload.amountPaid === "number" && (
                  <p>Nominal dibayar: {formatRupiah(record.payload.amountPaid)}</p>
                )}
                {record.payload.paymentMethod && (
                  <p>Metode pembayaran: {PAYMENT_LABELS[record.payload.paymentMethod] || record.payload.paymentMethod}</p>
                )}
                {record.payload.payments && record.payload.payments.length > 0 && (
                  <div>
                    <p>Rincian pembayaran:</p>
                    <ul className="list-inside list-disc">
                      {record.payload.payments.map((payment, index) => (
                        <li key={`${payment.method}-${index}`}>
                          {PAYMENT_LABELS[payment.method] || payment.method}: {formatRupiah(payment.amount)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ul className="list-inside list-disc">
                  {record.payload.items.map((item, index) => <li key={`${item.productId}-${index}`}>{item.name} × {item.quantity}</li>)}
                </ul>
                {canRetry && (
                  <button type="button" onClick={() => void retryRecord(record.clientMutationId)} disabled={isSyncing}
                    className="min-h-10 rounded-lg border border-brand-300 px-3 font-semibold text-brand-700 disabled:opacity-50">
                    Coba lagi
                  </button>
                )}
                {!ownOnly && role === "OWNER" && !record.serverTransactionId && (
                  <button type="button" className="ml-2 min-h-10 rounded-lg border border-brand-300 px-3 font-semibold text-brand-700" onClick={() => {
                    try { exportOfflineRecord(record); setExportError(null); }
                    catch { setExportError("Data belum dapat diunduh. Coba lagi di perangkat ini."); }
                  }}>Unduh data transaksi</button>
                )}
              </div>
            </details>
          );
        })}
      </section>

      {pendingShifts.length > 0 && (
        <section aria-labelledby="offline-shifts-heading" className="space-y-3">
          <h3 id="offline-shifts-heading" className="text-base font-bold text-surface-900">Shift yang menunggu sinkronisasi</h3>
          {pendingShifts.map((shift) => (
            <div key={shift.id} className="rounded-lg border border-surface-200 bg-white p-3 text-sm text-surface-700">
              <p className="font-semibold text-surface-900">{shift.status === "OPEN" ? "Shift masih terbuka" : "Shift sudah ditutup di perangkat"}</p>
              <p>Mulai: {new Date(shift.openedAt).toLocaleString("id-ID")} · Kasir: {shift.cashier?.name || shift.cashierId}</p>
              {shift.syncError && <p role="alert" className="mt-2 text-danger-600">{shift.syncError}</p>}
              {(shift.cashierId !== currentIdentity?.cashierId || shift.storeId !== currentIdentity?.storeId) && (
                <p className="mt-2">Masuk sebagai kasir asal untuk menyinkronkan shift ini.</p>
              )}
            </div>
          ))}
        </section>
      )}

      {!ownOnly && <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void clearSynced()}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-surface-200 px-4 text-sm font-semibold text-surface-700 hover:bg-surface-50"
        >
          <Trash2 className="h-4 w-4" />
          Hapus riwayat yang sudah sync
        </button>
      </div>}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-lg border border-surface-100 bg-white p-3">
      <p className="text-xs font-semibold uppercase text-surface-400">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${tone === "danger" ? "text-danger-600" : "text-surface-900"}`}>
        {value}
      </p>
    </div>
  );
}

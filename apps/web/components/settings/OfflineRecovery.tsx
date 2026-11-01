"use client";

import { useState } from "react";
import type { OfflineShiftRecord, OfflineTransactionRecord } from "@/lib/offline/offline-db";
import { formatRupiah } from "@/lib/utils";

export function exportOfflineRecord(record: OfflineTransactionRecord) {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), record }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "transaksi-offline-pemulihan.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function OfflineRecovery({ records, shifts, storeId }: { records: OfflineTransactionRecord[]; shifts: OfflineShiftRecord[]; storeId: string }) {
  const [error, setError] = useState<string | null>(null);
  const legacy = records.filter((record) =>
    !record.serverTransactionId &&
    (!record.payload.originStoreId || record.payload.originStoreId === storeId) &&
    (!record.payload.originStoreId || !record.payload.originCashierId),
  );
  const shiftConflicts = records.filter((record) => {
    if (record.serverTransactionId || record.payload.originStoreId !== storeId || !record.payload.originCashierId || !record.payload.shiftId) return false;
    const shift = shifts.find((item) => item.id === record.payload.shiftId && item.storeId === storeId);
    return !shift || Boolean(shift.closeSynced);
  });
  const groups = [
    {
      title: "Pemulihan transaksi lama",
      description: "Transaksi ini belum memiliki identitas asal yang lengkap. Periksa dan unduh datanya untuk rekonsiliasi bersama pengelola. Asal transaksi tidak ditetapkan otomatis.",
      records: legacy,
    },
    {
      title: "Transaksi perlu rekonsiliasi shift",
      description: "Shift transaksi sudah ditutup di server atau tidak tersedia di perangkat. Periksa dan unduh data untuk rekonsiliasi; transaksi tidak dipindahkan ke shift lain secara otomatis.",
      records: shiftConflicts,
    },
  ].filter((group) => group.records.length > 0);
  if (!groups.length) return null;

  return (
    <section aria-label="Pemulihan transaksi offline" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
      {groups.map((group) => <div key={group.title} className="space-y-3">
      <h3 className="font-bold text-amber-900">{group.title}</h3>
      <p className="text-sm text-amber-900">{group.description} Simpan berkas unduhan dengan aman.</p>
      {group.records.map((record) => (
        <details key={record.clientMutationId} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
          <summary className="cursor-pointer font-semibold">{record.clientMutationId} · {formatRupiah(record.payload.originalTotal || 0)}</summary>
          <div className="mt-3 space-y-2">
            <p>Dibuat: {new Date(record.createdAt).toLocaleString("id-ID")}</p>
            <p>Kasir: {record.payload.originCashierId || "Belum diketahui"} · Toko: {record.payload.originStoreId || "Belum diketahui"}</p>
            <ul className="list-inside list-disc">{(record.payload.items || []).map((item, index) => <li key={`${item.productId}-${index}`}>{item.name} × {item.quantity}</li>)}</ul>
            <button type="button" className="min-h-10 rounded-lg border border-brand-300 px-3 font-semibold text-brand-700" onClick={() => {
              try { exportOfflineRecord(record); setError(null); }
              catch { setError("Data belum dapat diunduh. Coba lagi di perangkat ini."); }
            }}>Unduh data transaksi</button>
          </div>
        </details>
      ))}
      </div>)}
    </section>
  );
}

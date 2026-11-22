"use client";

import { useState } from "react";
import { formatRupiah } from "@/lib/utils";
import type { LegacyGiroPayment } from "../helpers/giro-payment-request";

type ConfirmationState = { recover: boolean; remove: boolean };

export function LegacyGiroPaymentRecovery({ records, onRecover, onRemove }: {
  records: LegacyGiroPayment[];
  onRecover: (record: LegacyGiroPayment) => void;
  onRemove: (record: LegacyGiroPayment) => void;
}) {
  const [confirmed, setConfirmed] = useState<Record<string, ConfirmationState>>({});
  if (!records.length) return null;

  return <section aria-labelledby="legacy-giro-recovery-title" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
    <h3 id="legacy-giro-recovery-title" className="font-semibold">Pembayaran dari sesi lama perlu diperiksa</h3>
    <p className="mt-1 text-xs">Akun dan toko asal tidak tercatat. Periksa kembali catatan ini pada akun dan toko yang benar. Pemeriksaan menggunakan kunci lama dan tidak membuat pembayaran baru.</p>
    <ul className="mt-3 space-y-3">
      {records.map(record => {
        const state = confirmed[record.payableId] ?? { recover: false, remove: false };
        return <li key={record.payableId} className="border-t border-amber-200 pt-3">
          <p className="font-medium">Hutang {record.payableId}</p>
          {record.pending
            ? <p className="mt-1 text-xs">Pembayaran {formatRupiah(Number(record.pending.amount))} pada {record.pending.paidAt} belum dipastikan.</p>
            : <p className="mt-1 text-xs">Rincian catatan lama tidak dapat dibaca.</p>}
          {record.pending && <div className="mt-2 space-y-2">
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" checked={state.recover} onChange={event => setConfirmed(current => ({ ...current, [record.payableId]: { ...state, recover: event.target.checked } }))} className="mt-0.5" />
              <span>Saya sudah memilih akun dan toko yang ingin diperiksa.</span>
            </label>
            <button type="button" disabled={!state.recover} onClick={() => onRecover(record)} className="min-h-10 rounded-md border border-amber-500 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand-500">Periksa pembayaran pada akun/toko ini</button>
          </div>}
          <div className="mt-2 space-y-2">
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" checked={state.remove} onChange={event => setConfirmed(current => ({ ...current, [record.payableId]: { ...state, remove: event.target.checked } }))} className="mt-0.5" />
              <span>Saya sudah memeriksa riwayat transaksi dan memastikan catatan ini boleh dihapus.</span>
            </label>
            <button type="button" disabled={!state.remove} onClick={() => onRemove(record)} className="min-h-10 rounded-md border border-amber-500 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand-500">Hapus catatan setelah memeriksa riwayat</button>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}

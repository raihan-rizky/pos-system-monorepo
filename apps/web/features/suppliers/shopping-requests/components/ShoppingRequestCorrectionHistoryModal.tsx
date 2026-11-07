"use client";
import React from "react";
import { useCorrectionHistory } from "../hooks/useShoppingRequestCorrection";
import { CorrectionDialog, CorrectionImpact } from "./ShoppingRequestCorrectionModal";

export function ShoppingRequestCorrectionHistoryModal({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const history = useCorrectionHistory(requestId);
  return <CorrectionDialog title="Riwayat perubahan daftar" onClose={onClose}>
    <div className="space-y-4">
      {history.isPending && <p role="status">Memuat riwayat perubahan…</p>}
      {history.isError && <p role="alert">{history.error.message}</p>}
      {history.data?.length === 0 && <p>Belum ada perubahan yang tercatat.</p>}
      {history.data?.map(entry => <article key={entry.id} className="space-y-3 rounded-xl border border-slate-200 p-3">
        <p className="font-semibold">{entry.actorName ?? "Pengguna"} · {new Date(entry.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p>
        <p>Alasan: {entry.reason}</p><CorrectionImpact preview={entry.preview} />
      </article>)}
      <button type="button" autoFocus onClick={onClose} className="min-h-11 rounded-lg border px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">Tutup riwayat</button>
    </div>
  </CorrectionDialog>;
}

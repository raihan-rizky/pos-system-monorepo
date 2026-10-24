"use client";
import { useState } from "react";
import { StockGroupWorkspaceModal } from "./StockGroupWorkspace";

export function ProductPricingAction({ groupId, identityChanged, disabled }: { groupId?: string | null; identityChanged: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm sm:col-span-2">
    <p>Harga jual dan HPP dikelola di Harga grup. Sumber dapat diedit; pengikut Auto memakai HPP sumber. Pilih Manual di sana jika ingin mengisi sendiri.</p>
    <p>Perubahan harga diterapkan terpisah setelah pratinjau. Input detail produk Anda tetap tersimpan di formulir ini.</p>
    {identityChanged && <p className="text-amber-900">Simpan perubahan identitas atau satuan terlebih dahulu agar pratinjau memakai grup yang benar.</p>}
    {!groupId && <p>Grup harga belum tersedia. Simpan produk terlebih dahulu.</p>}
    <button type="button" className="min-h-11 rounded-lg border border-slate-300 px-3 font-semibold disabled:opacity-50 focus-visible:outline-blue-600" disabled={!groupId || identityChanged || disabled} onClick={() => setOpen(true)}>Atur harga grup / Manual</button>
    {open && groupId && <StockGroupWorkspaceModal stockGroupId={groupId} initialTab="pricing" canUpdateStock={false} canUpdateProducts canCreateProducts={false} onSaved={() => {}} onClose={() => setOpen(false)} />}
  </div>;
}

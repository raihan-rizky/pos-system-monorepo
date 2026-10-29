"use client";

import { useState } from "react";
import { useSpecialPricingSettings, useUpdateSpecialPricingSettings } from "../hooks/useSpecialPricingSettings";

export default function SpecialPricingSettingsTab() {
  const settings = useSpecialPricingSettings();
  const update = useUpdateSpecialPricingSettings();
  const [draft, setDraft] = useState<boolean | null>(null);
  const enabled = draft ?? settings.data ?? false;
  const unavailable = settings.isError || settings.data === undefined || update.isPending;
  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (!unavailable) update.mutate(enabled, { onSuccess: () => setDraft(null) }); }}>
      <div>
        <h2 className="text-lg font-bold text-surface-900">Harga Khusus</h2>
        <p className="mt-1 text-sm text-surface-500">Atur penggunaan harga khusus di seluruh toko.</p>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-surface-900">
        <input type="checkbox" role="switch" checked={enabled} disabled={unavailable} onChange={(event) => { setDraft(event.target.checked); update.reset(); }} className="h-5 w-5 accent-brand-600" />
        Aktifkan Harga Khusus
      </label>
      <p className="text-sm text-surface-600">Harga Khusus nonaktif secara default. Saat dinonaktifkan, transaksi baru memakai harga normal. Aturan dan harga Agen/Dinas tetap tersimpan untuk digunakan kembali.</p>
      {settings.isPending && <p role="status" className="text-sm text-surface-500">Memuat pengaturan…</p>}
      {(settings.error || update.error) && <p role="alert" className="text-sm text-red-700">{(settings.error ?? update.error)?.message}</p>}
      {update.isSuccess && <p role="status" className="text-sm text-emerald-700">Pengaturan Harga Khusus berhasil disimpan.</p>}
      <button type="submit" disabled={unavailable} className="min-h-11 rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{update.isPending ? "Menyimpan…" : "Simpan pengaturan"}</button>
    </form>
  );
}

"use client";

import { LockKeyhole } from "lucide-react";
import { useSpecialPricingSettings } from "../hooks/useSpecialPricingSettings";

export function SpecialPricingRestrictedNotice() {
  const settings = useSpecialPricingSettings();

  return (
    <section className="mx-auto flex min-h-[18rem] max-w-md flex-col items-center justify-center gap-3 p-5 text-center" aria-label="Harga Khusus" role={settings.isError ? "alert" : "status"}>
      <LockKeyhole aria-hidden="true" className="h-8 w-8 text-slate-600" />
      {settings.isError ? (
        <>
          <p className="font-semibold text-slate-900">Pengaturan Harga Khusus belum dapat dimuat.</p>
          <button type="button" onClick={() => void settings.refetch()} className="min-h-11 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">Coba lagi</button>
        </>
      ) : settings.isPending || !settings.isFetchedAfterMount ? (
        <p className="font-semibold text-slate-900">Memuat pengaturan Harga Khusus…</p>
      ) : settings.data !== true ? (
        <>
          <p className="font-semibold text-slate-900">Fitur Harga Khusus dinonaktifkan.</p>
          <p className="text-sm text-slate-600">Hubungi Owner untuk mengaktifkan fitur ini.</p>
        </>
      ) : (
        <p className="font-semibold text-slate-900">Pengelolaan Harga Khusus hanya tersedia untuk Owner.</p>
      )}
    </section>
  );
}

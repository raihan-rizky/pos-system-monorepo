"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { clearClientAuthState } from "@/lib/auth/pos-session";

export function AccessStatus({ unavailable = false, onRetry }: { unavailable?: boolean; onRetry?: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function logout() {
    setLeaving(true);
    setError(null);
    try {
      const { error: signOutError } = await createClient().auth.signOut();
      if (signOutError) throw signOutError;
      await fetch("/api/auth/clear-session", { method: "POST" });
      clearClientAuthState();
      window.location.assign("/login");
    } catch {
      setError("Belum dapat keluar. Periksa koneksi lalu coba lagi.");
      setLeaving(false);
    }
  }
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-surface-50 p-6">
      <section className="w-full max-w-md rounded-xl border border-surface-200 bg-white p-6 shadow-sm" aria-labelledby="access-status-title">
        <h1 id="access-status-title" className="text-xl font-bold text-surface-900">
          {unavailable ? "Hak akses belum dapat diperiksa" : "Akses belum tersedia"}
        </h1>
        <p className="mt-3 text-sm text-surface-600" role="status">
          {unavailable ? "Koneksi sedang bermasalah. Pekerjaan Anda tetap tersimpan di halaman ini. Coba periksa hak akses lagi setelah koneksi pulih." : "Belum ada halaman yang diizinkan untuk akun Anda. Hubungi Owner untuk meminta akses, lalu periksa kembali."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => onRetry ? onRetry() : window.location.assign("/")} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            {unavailable ? "Coba lagi" : "Periksa akses lagi"}
          </button>
          <button type="button" disabled={leaving} onClick={() => void logout()} className="rounded-lg border border-surface-200 px-4 py-2 text-sm font-semibold text-surface-700 disabled:opacity-50">
            {leaving ? "Sedang keluar…" : "Keluar"}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </section>
    </main>
  );
}

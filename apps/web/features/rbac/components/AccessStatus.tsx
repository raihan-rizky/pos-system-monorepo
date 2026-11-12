"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { clearClientAuthState } from "@/lib/auth/pos-session";
import { signOutCurrentSession } from "@/lib/auth/local-sign-out";

export function AccessStatus({
  unavailable = false,
  reason,
  onRetry,
}: {
  unavailable?: boolean;
  reason?: "unavailable" | "login-required" | "forbidden";
  onRetry?: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = reason ?? (unavailable ? "unavailable" : "no-page");
  const copy = {
    unavailable: {
      title: "Hak akses belum dapat diperiksa",
      message: "Periksa koneksi, lalu coba periksa hak akses lagi.",
    },
    "login-required": {
      title: "Sesi Anda berakhir",
      message: "Masuk kembali dengan akun yang sama untuk melanjutkan keranjang yang tersimpan di tab ini.",
    },
    forbidden: {
      title: "Akses akun berubah",
      message: "Hubungi Owner jika Anda masih memerlukan akses, lalu periksa kembali.",
    },
    "no-page": {
      title: "Akses belum tersedia",
      message: "Belum ada halaman yang diizinkan untuk akun Anda. Hubungi Owner untuk meminta akses, lalu periksa kembali.",
    },
  }[status];
  const actionClass = "rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
  async function logout() {
    setLeaving(true);
    setError(null);
    try {
      await signOutCurrentSession(createClient());
      clearClientAuthState();
      window.location.replace("/login");
    } catch {
      setError("Belum dapat keluar. Periksa koneksi lalu coba lagi.");
      setLeaving(false);
    }
  }
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-surface-50 p-6">
      <section className="w-full max-w-md rounded-xl border border-surface-200 bg-white p-6 shadow-sm" aria-labelledby="access-status-title">
        <h1 id="access-status-title" className="text-xl font-bold text-surface-900">
          {copy.title}
        </h1>
        <p className="mt-3 text-sm text-surface-600" role="status">
          {copy.message}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {status === "login-required" ? (
            <a href="/login" className={actionClass}>Masuk lagi</a>
          ) : (
            <>
              <button type="button" onClick={() => onRetry ? onRetry() : window.location.assign("/")} className={actionClass}>
                {status === "unavailable" ? "Coba lagi" : "Periksa akses lagi"}
              </button>
              <button type="button" disabled={leaving} onClick={() => void logout()} className="rounded-lg border border-surface-200 px-4 py-2 text-sm font-semibold text-surface-700 disabled:opacity-50">
                {leaving ? "Sedang keluar…" : "Keluar"}
              </button>
            </>
          )}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </section>
    </main>
  );
}

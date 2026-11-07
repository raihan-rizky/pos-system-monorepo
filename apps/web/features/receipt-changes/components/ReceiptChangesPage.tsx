"use client";

import Link from "next/link";
import { ArrowLeft, CircleAlert, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReceiptChangeRecord } from "../types";
import { ReceiptChangeComparison } from "./ReceiptChangeComparison";

export function ReceiptChangesPage({
  transactionId,
  initialChangeId,
}: {
  transactionId: string;
  initialChangeId?: string;
}) {
  const [changes, setChanges] = useState<ReceiptChangeRecord[] | null>(null);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setChanges(null);
    setError("");
    fetch(
      `/api/transactions/${encodeURIComponent(transactionId)}/receipt-changes`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            result?.message || "Riwayat perubahan nota belum dapat dimuat.",
          );
        if (!Array.isArray(result?.data?.changes))
          throw new Error(
            "Rincian perubahan belum dapat dibaca. Silakan coba lagi.",
          );
        if (!controller.signal.aborted)
          setChanges(result.data.changes as ReceiptChangeRecord[]);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error && !(reason instanceof TypeError)
              ? reason.message
              : "Koneksi belum tersedia. Periksa koneksi Anda, lalu coba lagi.",
          );
      });
    return () => controller.abort();
  }, [transactionId, retryVersion]);

  return (
    <main
      aria-busy={!changes && !error}
      className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-surface-50 p-4 md:p-6 lg:p-8"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          href="/history"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-surface-600 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Kembali ke Riwayat
        </Link>
        <header className="flex flex-wrap items-start justify-between gap-4 pb-1">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-surface-900 sm:text-3xl">
              Perubahan nota
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-surface-600">
              Telusuri setiap revisi. Pahami apa yang berubah.
            </p>
          </div>
          {changes?.length ? (
            <div className="min-w-0 max-w-full rounded-xl border border-surface-200 bg-white px-4 py-2.5">
              <p className="text-xs text-surface-600">Nomor nota</p>
              <p className="mt-1 break-words text-sm font-semibold text-surface-900">
                {changes.at(-1)?.after.invoiceNumber || "Tanpa nomor nota"}
              </p>
            </div>
          ) : null}
        </header>
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-white p-6"
          >
            <CircleAlert aria-hidden="true" className="h-6 w-6 text-red-700" />
            <h2 className="mt-3 text-lg font-semibold text-surface-900">
              Riwayat belum bisa dibuka
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-surface-600">
              {error}
            </p>
            <button
              type="button"
              onClick={() => setRetryVersion((version) => version + 1)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Coba lagi
            </button>
          </div>
        )}
        {!changes && !error && (
          <div role="status">
            <p className="mb-4 text-sm text-surface-600">
              Memuat riwayat perubahan nota...
            </p>
            <div
              aria-hidden="true"
              className="grid gap-6 motion-safe:animate-pulse lg:grid-cols-[232px_minmax(0,1fr)]"
            >
              <div className="hidden h-80 rounded-2xl bg-surface-200 lg:block" />
              <div className="space-y-4">
                <div className="h-7 w-2/3 rounded-lg bg-surface-200" />
                <div className="h-28 rounded-2xl border border-surface-200 bg-white" />
                <div className="h-48 rounded-2xl border border-surface-200 bg-white" />
              </div>
            </div>
          </div>
        )}
        {changes && (
          <ReceiptChangeComparison
            key={`${transactionId}:${initialChangeId || ""}`}
            changes={changes}
            initialChangeId={initialChangeId}
          />
        )}
      </div>
    </main>
  );
}

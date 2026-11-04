"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReceiptChangeRecord } from "../types";
import { ReceiptChangeComparison } from "./ReceiptChangeComparison";

export function ReceiptChangesPage({ transactionId, initialChangeId }: { transactionId: string; initialChangeId?: string }) {
  const [changes, setChanges] = useState<ReceiptChangeRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setChanges(null);
    setError("");
    fetch(`/api/transactions/${encodeURIComponent(transactionId)}/receipt-changes`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Riwayat perubahan nota belum dapat dimuat.");
        if (!controller.signal.aborted) setChanges(result.data.changes as ReceiptChangeRecord[]);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Riwayat perubahan nota belum dapat dimuat.");
      });
    return () => controller.abort();
  }, [transactionId]);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <Link href="/history" className="inline-flex min-h-10 items-center text-sm font-semibold text-brand-700 hover:underline">Kembali ke Riwayat</Link>
        <header>
          <h1 className="text-2xl font-bold text-surface-900">Perubahan nota</h1>
          <p className="mt-1 text-sm text-surface-600">Bandingkan perubahan yang disimpan oleh Sales dan lihat rincian nota asli.</p>
        </header>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {!changes && !error && <p role="status" className="text-sm text-surface-600">Memuat riwayat perubahan...</p>}
        {changes && <ReceiptChangeComparison key={`${transactionId}:${initialChangeId || ""}`} changes={changes} initialChangeId={initialChangeId} />}
      </div>
    </main>
  );
}

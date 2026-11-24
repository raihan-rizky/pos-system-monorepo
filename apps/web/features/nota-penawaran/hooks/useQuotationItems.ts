"use client";

import { useEffect, useState } from "react";
import type { Transaction } from "@/hooks/useTransactions";
import type { TaxResponse } from "@/features/transaction-tax/hooks/useReceiptTax";
import type { QuotationItemInput } from "../helpers/quotation-items";

type QuotationResponse = { items: Transaction["items"]; tax: TaxResponse };
type LoadResult = { transactionId: string; items: Transaction["items"]; error?: string };

export function useQuotationItems(transactionId: string, open: boolean) {
  const url = `/api/transactions/${encodeURIComponent(transactionId)}/quotation-items`;
  const [loaded, setLoaded] = useState<LoadResult | null>(null);

  useEffect(() => {
    setLoaded(null);
    if (!open) return;
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.items)) throw new Error(data.message || "Baris tambahan belum dapat dimuat.");
        if (!controller.signal.aborted) setLoaded({ transactionId, items: data.items });
      })
      .catch(cause => {
        if (!controller.signal.aborted) setLoaded({ transactionId, items: [], error: cause instanceof Error ? cause.message : "Baris tambahan belum dapat dimuat." });
      });
    return () => controller.abort();
  }, [open, transactionId, url]);

  const current = loaded?.transactionId === transactionId ? loaded : null;
  return {
    items: current?.items ?? [],
    ready: Boolean(current && !current.error),
    error: current?.error,
    accept: (items: Transaction["items"]) => setLoaded({ transactionId, items }),
    save: async (items: QuotationItemInput[]): Promise<QuotationResponse> => {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Baris tambahan belum dapat disimpan.");
      return data;
    },
  };
}

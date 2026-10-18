"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { QueryClientContext } from "@tanstack/react-query";
import { useRole } from "@/components/providers/RoleProvider";
import type { Transaction } from "@/hooks/useTransactions";
import { calculateTransactionTax, calculateTaxPaymentState, getTransactionTaxMethod, getTransactionTaxRate } from "../helpers/tax-calculation";

type TaxResponse = { transaction: Partial<Transaction> & { id: string }; snapshot: Record<string, unknown> };

export function useReceiptTax(transaction: Transaction, open: boolean) {
  const queryClient = useContext(QueryClientContext);
  const { canPerform } = useRole();
  const [saved, setSaved] = useState<TaxResponse | null>(null);
  const [input, setInput] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const document = useMemo(() => saved?.transaction.id === transaction.id ? { ...transaction, ...saved.transaction } as Transaction : transaction, [saved, transaction]);
  const canEdit = canPerform(document.status === "DRAFT" ? "transaction.draft" : "transaction", "update") && document.status !== "VOIDED" && document.status !== "REFUNDED";
  const taxMethod = getTransactionTaxMethod(document);
  const rateText = input ?? String(getTransactionTaxRate(document));
  const rate = Number(rateText.replace(",", "."));
  const { preview, validationError } = useMemo(() => {
    if (input === null) return { preview: document, validationError: null };
    try {
      if (!rateText.trim()) throw new Error("Isi persentase pajak terlebih dahulu.");
      const totals = calculateTransactionTax({ subtotal: Number(document.subtotal), discount: Number(document.discount ?? 0), taxRate: rate, taxMethod });
      const payment = calculateTaxPaymentState({ status: document.status, paymentMethod: document.paymentMethod, amountPaid: Number(document.amountPaid), change: Number(document.change), total: totals.total, previousTotal: Number(document.total) });
      return { preview: { ...document, taxRate: rate, taxMethod, tax: totals.tax, total: totals.total, amountPaid: payment.amountPaid, change: payment.change, status: payment.status as Transaction["status"] }, validationError: null };
    } catch (cause) { return { preview: document, validationError: (cause as Error).message }; }
  }, [document, input, rateText, rate, taxMethod]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setReady(false); setError(null); setInput(null); setSaved(null);
    void fetch(`/api/transactions/${transaction.id}/tax`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Pajak belum dapat dimuat.");
        if (!controller.signal.aborted) { setSaved(data); setReady(true); }
      })
      .catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); });
    return () => controller.abort();
  }, [open, transaction.id]);

  async function ensureSaved(): Promise<Transaction> {
    if (!ready || !saved) throw new Error("Pajak belum selesai dimuat. Tutup dan buka kembali nota bila perlu.");
    if (validationError) { setError(validationError); throw new Error(validationError); }
    if (input === null) return document;
    if (!canEdit) throw new Error("Anda tidak memiliki izin mengubah pajak transaksi ini.");
    if (busy.current) throw new Error("Pajak sedang disimpan. Mohon tunggu sebentar.");
    busy.current = true; setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/transactions/${transaction.id}/tax`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxRate: rate, expected: saved.snapshot }),
      });
      const data: TaxResponse & { message?: string } = await response.json();
      if (!response.ok) throw new Error(data.message || "Pajak gagal disimpan.");
      flushSync(() => { setSaved(data); setInput(null); });
      for (const key of ["transactions", "transaction-history", "transaction", "customers", "customer-debt", "customer-transactions", "reports", "dashboard", "approval-quote"]) {
        void queryClient?.invalidateQueries({ queryKey: [key] });
      }
      return { ...document, ...data.transaction } as Transaction;
    } catch (cause) { setError((cause as Error).message); throw cause; }
    finally { busy.current = false; setSaving(false); }
  }

  return { transaction: preview, taxMethod, rateText, canEdit, ready, saving, invalid: Boolean(validationError), error: error ?? validationError, dirty: input !== null, setRateText: (value: string) => { setInput(value); setError(null); }, ensureSaved };
}

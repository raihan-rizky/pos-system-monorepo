"use client";

import { useEffect, useState } from "react";
import { Button, Modal } from "@pos/ui";
import type { Transaction } from "@/hooks/useTransactions";
import type { PrintingReceipt } from "../types";
import { PrintingReceiptModal } from "./PrintingReceiptModal";

export function PrintingReceiptTransactionModal({ open, onClose, transaction }: {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
}) {
  const [receipt, setReceipt] = useState<PrintingReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const receiptId = transaction.printingReceipt?.id;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setReceipt(null); setError(null);
    async function read(url: string) {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Nota belum dapat dimuat. Coba lagi.");
      return data;
    }
    void (async () => {
      const id = receiptId ?? (await read(`/api/transactions/${transaction.id}`)).printingReceipt?.id;
      if (!id) throw new Error("Dokumen nota belum ditemukan untuk transaksi ini.");
      const saved: PrintingReceipt = await read(`/api/printing-receipts/${id}`);
      if (saved.transactionId !== transaction.id) throw new Error("Nota tidak sesuai dengan transaksi yang dibuka.");
      if (!controller.signal.aborted) setReceipt(saved);
    })().catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Nota belum dapat dimuat."); });
    return () => controller.abort();
  }, [open, receiptId, transaction.id, attempt]);

  if (receipt) {
    return <PrintingReceiptModal open={open} onClose={onClose} receipt={receipt} transaction={receipt.transaction ?? transaction} />;
  }
  return <Modal open={open} onClose={onClose} title="Nota Percetakan" size="lg">
    {error ? <div role="alert" className="space-y-3">
      <p className="text-sm text-danger-700">{error}</p>
      <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Coba lagi</Button>
    </div> : <p role="status" className="py-8 text-center text-sm text-surface-500">Memuat nota asli dan pembayaran terbaru…</p>}
  </Modal>;
}

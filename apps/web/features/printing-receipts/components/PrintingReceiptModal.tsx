"use client";

import { useState } from "react";
import { Button, Modal } from "@pos/ui";
import { Download, Printer } from "lucide-react";
import { downloadPrintingReceiptPdf, printPrintingReceiptPdf } from "../export-pdf";
import type { PrintingReceipt } from "../types";
import type { PrintingReceiptPayment } from "../layout";
import { PrintingReceiptView } from "./PrintingReceiptView";

export interface PrintingReceiptModalProps {
  open: boolean;
  onClose: () => void;
  receipt: PrintingReceipt;
  transaction?: PrintingReceiptPayment | null;
}

export function PrintingReceiptModal({ open, onClose, receipt, transaction }: PrintingReceiptModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exportReceipt = async (print: boolean) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await (print ? printPrintingReceiptPdf : downloadPrintingReceiptPdf)(receipt, transaction); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "PDF belum dapat dibuat. Coba lagi."); }
    finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title={`Nota ${receipt.subcategory} · ${receipt.number}`} size="full">
    <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
      <p className="text-sm text-surface-600">{receipt.transactionId ? "Nota transaksi tersimpan. Pembayaran terbaru tercermin pada jumlah dan sisa." : "Pratinjau draft. Nota ini belum menjadi transaksi."}</p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" loading={busy} onClick={() => void exportReceipt(false)}><Download size={16} />Unduh PDF</Button>
        <Button size="sm" loading={busy} onClick={() => void exportReceipt(true)}><Printer size={16} />Cetak</Button>
      </div>
    </div>
    {error && <p role="alert" className="mb-3 rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
    <div className="printing-receipt-viewport max-h-[70dvh]" tabIndex={0} role="region" aria-label="Pratinjau nota, geser untuk melihat seluruh halaman">
      <PrintingReceiptView receipt={receipt} transaction={transaction} />
    </div>
  </Modal>;
}

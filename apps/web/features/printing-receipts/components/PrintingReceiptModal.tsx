"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Modal } from "@pos/ui";
import { Download, Pencil, Printer } from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import { invalidateTransactionViews } from "@/features/transaction-history/helpers/invalidate";
import { downloadPrintingReceiptPdf, printPrintingReceiptPdf } from "../export-pdf";
import { getPrintingReceiptScopeKey } from "../permissions";
import { getPrintingReceiptPreviewRecord } from "../receipt-api";
import type { PrintingReceipt } from "../types";
import type { PrintingReceiptPayment } from "../layout";
import { PrintingReceiptView } from "./PrintingReceiptView";
import { ProcessedPrintingReceiptEditor } from "./ProcessedPrintingReceiptEditor";

const EDITABLE_PROCESSED_STATUSES = new Set(["COMPLETED", "DP", "PENDING_APPROVAL"]);

export interface PrintingReceiptModalProps {
  open: boolean;
  onClose: () => void;
  onReceiptUpdated: (receipt: PrintingReceipt) => void;
  receipt: PrintingReceipt;
  transaction?: PrintingReceiptPayment | null;
  startEditing?: boolean;
}

export function PrintingReceiptModal({ open, onClose, onReceiptUpdated, receipt, transaction, startEditing = false }: PrintingReceiptModalProps) {
  const { userId, storeId, authorizationFingerprint, canPerform } = useRole();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ receipt: PrintingReceipt; scope: string } | null>(null);
  const [returnFocus, setReturnFocus] = useState(false);
  const mounted = useRef(true);
  const autoStarted = useRef(false);
  const scope = getPrintingReceiptScopeKey({ userId, storeId, authorizationFingerprint });
  const canEdit = Boolean(receipt.transactionId && canPerform("printing_receipt.processed", "update") &&
    EDITABLE_PROCESSED_STATUSES.has(receipt.transaction?.status ?? transaction?.status ?? ""));
  const latest = useRef({ open, canEdit, scope });
  latest.current = { open, canEdit, scope };
  const activeEdit = open && canEdit && editing?.scope === scope ? editing.receipt : null;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    setEditing(current => !open || !canEdit || current?.scope !== scope ? null : current);
  }, [open, canEdit, scope]);

  const exportReceipt = async (print: boolean) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await (print ? printPrintingReceiptPdf : downloadPrintingReceiptPdf)(receipt, transaction); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "PDF belum dapat dibuat. Coba lagi."); }
    finally { setBusy(false); }
  };
  const openEdit = useCallback(async () => {
    if (busy || !canEdit) return;
    setBusy(true); setError(null); setReturnFocus(false);
    try {
      const current = await getPrintingReceiptPreviewRecord(receipt);
      if (!mounted.current || !latest.current.open || !latest.current.canEdit || latest.current.scope !== scope) return;
      if (!current.transactionId || !EDITABLE_PROCESSED_STATUSES.has(current.transaction?.status ?? "")) {
        throw new Error("Nota ini tidak lagi dapat diedit. Buka kembali transaksi untuk memuat status terbaru.");
      }
      setEditing({ receipt: current, scope });
    } catch (failure) {
      if (mounted.current && latest.current.open && latest.current.canEdit && latest.current.scope === scope) {
        setError(failure instanceof Error ? failure.message : "Nota belum dapat dibuka untuk diedit.");
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [busy, canEdit, receipt, scope]);
  useEffect(() => {
    if (!open) { autoStarted.current = false; return; }
    if (!startEditing || autoStarted.current) return;
    autoStarted.current = true;
    if (!canEdit) { setError("Nota ini tidak dapat diedit atau Anda tidak memiliki izin."); return; }
    void openEdit();
  }, [open, startEditing, canEdit, openEdit]);
  const closeEdit = () => { setEditing(null); if (startEditing) onClose(); else setReturnFocus(true); };
  const savedEdit = (saved: PrintingReceipt) => {
    closeEdit();
    onReceiptUpdated(saved);
    invalidateTransactionViews(queryClient);
    if (saved.transactionId) void queryClient.invalidateQueries({ queryKey: ["transaction", saved.transactionId] });
    for (const key of ["printing-receipts", "inventory", "inventory-logs", "inventory-management", "stock-group", "customers", "customer-debt", "customer-receivables", "customer-recap", "financial-report", "dashboard", "active-shift"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
  return <>
    <Modal open={open && !activeEdit} onClose={onClose} title={`Nota ${receipt.subcategory} · ${receipt.number}`} size="full">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <p className="text-sm text-surface-600">{receipt.transactionId ? "Nota transaksi tersimpan. Pembayaran terbaru tercermin pada jumlah dan sisa." : "Pratinjau draft. Nota ini belum menjadi transaksi."}</p>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button variant="danger" size="sm" loading={busy} autoFocus={returnFocus} onClick={() => void openEdit()}><Pencil size={16} />Edit nota</Button>}
          <Button variant="secondary" size="sm" loading={busy} onClick={() => void exportReceipt(false)}><Download size={16} />Unduh PDF</Button>
          <Button size="sm" loading={busy} onClick={() => void exportReceipt(true)}><Printer size={16} />Cetak</Button>
        </div>
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
      <div className="printing-receipt-viewport max-h-[70dvh]" tabIndex={0} role="region" aria-label="Pratinjau nota, geser untuk melihat seluruh halaman">
        <PrintingReceiptView receipt={receipt} transaction={transaction} />
      </div>
    </Modal>
    {activeEdit && <ProcessedPrintingReceiptEditor key={activeEdit.id} receipt={activeEdit} onClose={closeEdit} onSaved={savedEdit} />}
  </>;
}

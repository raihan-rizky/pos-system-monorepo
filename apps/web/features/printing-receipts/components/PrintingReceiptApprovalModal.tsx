"use client";

import { useState } from "react";
import { Button, Modal } from "@pos/ui";
import { useApproveTransaction, type Transaction } from "@/hooks/useTransactions";
import { formatRupiah } from "@/lib/utils";

export function buildPrintingReceiptApprovalInput(tx: Transaction) {
  return { id: tx.id, isPayLater: Number(tx.amountPaid) < Number(tx.total) };
}

export function PrintingReceiptApprovalModal({ tx, onClose, onSuccess }: {
  tx: Transaction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const approve = useApproveTransaction();
  const [error, setError] = useState<string | null>(null);
  const remaining = Math.max(0, Number(tx.total) - Number(tx.amountPaid));
  async function confirm() {
    if (approve.isPending) return;
    setError(null);
    try {
      await approve.mutateAsync(buildPrintingReceiptApprovalInput(tx));
      onSuccess();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Nota belum dapat disetujui. Coba lagi.");
    }
  }
  return <Modal open onClose={onClose} title={`Setujui Nota ${tx.printingSubcategory ?? "Percetakan"}`} size="lg">
    <div className="space-y-4">
      <div>
        <p className="font-semibold text-surface-900">{tx.printingReceipt?.number ?? tx.invoiceNumber}</p>
        <p className="mt-1 text-sm text-surface-600">{tx.customerName || "Pelanggan umum"} · Isi nota mengikuti dokumen tersimpan.</p>
      </div>
      <ul className="max-h-64 divide-y divide-surface-100 overflow-y-auto rounded-xl border border-surface-200 px-4">
        {tx.items.map((item, index) => <li key={item.id ?? index} className="flex justify-between gap-3 py-3 text-sm">
          <span>{item.productName} × {item.quantity}</span><span className="whitespace-nowrap font-medium">{formatRupiah(Number(item.subtotal))}</span>
        </li>)}
      </ul>
      <dl className="space-y-2 rounded-xl bg-surface-50 p-4 text-sm">
        <div className="flex justify-between"><dt>Total nota</dt><dd className="font-semibold">{formatRupiah(Number(tx.total))}</dd></div>
        <div className="flex justify-between"><dt>Pembayaran tersimpan</dt><dd>{formatRupiah(Number(tx.amountPaid))}</dd></div>
        <div className="flex justify-between"><dt>Sisa</dt><dd>{formatRupiah(remaining)}</dd></div>
      </dl>
      {remaining > 0 && <p className="text-sm text-surface-600">Sisa pembayaran dapat dilunasi melalui Riwayat setelah nota disetujui.</p>}
      {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" disabled={approve.isPending} onClick={onClose}>Batal</Button>
        <Button loading={approve.isPending} onClick={() => void confirm()}>Setujui nota</Button>
      </div>
    </div>
  </Modal>;
}

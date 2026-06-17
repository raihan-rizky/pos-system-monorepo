import React, { useState } from "react";
import { ChevronDown, FileText, Eye } from "lucide-react";
import { formatDate, formatRupiah } from "@/lib/utils";
import { ReceiptModal } from "@/components/ReceiptModal";
import type { Transaction as ReceiptTransaction } from "@/hooks/useTransactions";
import type { SuratJalanBundle } from "../api/surat-jalan-api";

interface SuratJalanHeaderProps {
  transactionId: string;
  bundle: SuratJalanBundle;
}

export const SuratJalanHeader: React.FC<SuratJalanHeaderProps> = ({
  transactionId,
  bundle,
}) => {
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState(false);

  return (
    <>
      <div className="rounded-2xl border border-surface-200 bg-gradient-to-br from-surface-50 to-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setInvoicePreviewOpen((current) => !current)}
              className="group inline-flex items-center gap-1.5 rounded-lg text-xs font-black uppercase tracking-widest text-brand-600 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              aria-expanded={invoicePreviewOpen}
            >
              <FileText className="h-4 w-4 transition-transform group-hover:scale-110" aria-hidden="true" />
              Invoice Utama
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-300 ${invoicePreviewOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-lg font-black text-surface-900 tracking-tight">
                {bundle.transaction.invoiceNumber || "-"}
              </span>
              <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700 shadow-sm">
                {bundle.transaction.status}
              </span>
              <button
                type="button"
                onClick={() => setViewingReceipt(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-bold text-surface-700 transition-all hover:border-surface-300 hover:bg-surface-50 hover:text-surface-900 focus:outline-none focus:ring-2 focus:ring-surface-500/30 shadow-sm cursor-pointer"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                Lihat Struk
              </button>
            </div>
            <p className="mt-1.5 truncate text-sm font-medium text-surface-500">
              {bundle.transaction.customerName || "Umum"} <span className="mx-1 text-surface-300">•</span> {formatDate(new Date(bundle.transaction.createdAt))}
            </p>
          </div>
          <div className="text-left sm:text-right sm:pl-6 sm:border-l sm:border-surface-100">
            <p className="text-xs font-bold uppercase tracking-widest text-surface-400">
              Total Invoice
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-surface-900">
              {formatRupiah(bundle.transaction.total)}
            </p>
          </div>
        </div>

        {invoicePreviewOpen && (
          <div className="mt-4 overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm transition-all duration-300 animate-in slide-in-from-top-2 fade-in">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm text-left">
                <thead className="border-b border-surface-100 bg-surface-50 text-xs font-bold uppercase tracking-wider text-surface-500">
                  <tr>
                    <th className="px-4 py-3">Barang</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Harga</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {bundle.transaction.items.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-surface-50/50">
                      <td className="px-4 py-3 font-semibold text-surface-900">
                        {item.productName}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-surface-700">
                        {item.quantity} {item.unit || ""}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-surface-700">
                        {formatRupiah(item.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-surface-900">
                        {formatRupiah(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ReceiptModal
        open={viewingReceipt}
        onClose={() => setViewingReceipt(false)}
        transaction={bundle.transaction as unknown as ReceiptTransaction}
      />
    </>
  );
};

"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Smartphone,
  X,
} from "lucide-react";

import {
  useApproveTransaction,
  type Transaction,
} from "@/hooks/useTransactions";
import { formatRupiah, getDefaultProductImage } from "@/lib/utils";
import { useRole } from "@/components/providers/RoleProvider";

export function ApproveModal({
  tx,
  onClose,
  onSuccess,
}: {
  tx: Transaction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const approveTx = useApproveTransaction();
  const { role } = useRole();
  const [error, setError] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceTime, setInvoiceTime] = useState("");
  const [invoiceDateReason, setInvoiceDateReason] = useState("");
  const canChangeInvoiceDate = role === "OWNER" || role === "ADMIN";

  const hasMultiPayment = tx.payments && tx.payments.length > 0;
  const multiPaymentTotal = hasMultiPayment
    ? tx.payments!.reduce((sum, p) => sum + Number(p.amount), 0)
    : 0;

  const total = Number(tx.total);
  const isAlreadyLunas =
    (hasMultiPayment ? multiPaymentTotal : Number(tx.amountPaid)) >= total;

  const [amountPaidInput, setAmountPaidInput] = useState<string>(
    hasMultiPayment
      ? multiPaymentTotal.toString()
      : Number(tx.amountPaid).toString(),
  );
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>(
    tx.paymentMethod || "CASH",
  );
  const [isPayLater, setIsPayLater] = useState<boolean>(false);

  const parsedAmount = Number(amountPaidInput) || 0;
  const approvalStatus = isPayLater
    ? "DP"
    : parsedAmount > 0 && parsedAmount < total
      ? "DP"
      : "Lunas";

  const handleApprove = async () => {
    setError("");
    try {
      await approveTx.mutateAsync({
        id: tx.id,
        amountPaid: isPayLater ? 0 : parsedAmount,
        paymentMethod: hasMultiPayment
          ? tx.paymentMethod || "CASH"
          : paymentMethodInput,
        isPayLater,
        ...(canChangeInvoiceDate
          ? {
              invoiceDate: invoiceDate || undefined,
              invoiceTime: invoiceTime || null,
              invoiceDateReason: invoiceDateReason.trim() || null,
            }
          : {}),
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menyetujui transaksi");
    }
  };

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case "CASH":
        return <Banknote className="h-4 w-4 text-emerald-600" />;
      case "TRANSFER":
        return <Building2 className="h-4 w-4 text-blue-600" />;
      case "QRIS":
        return <Smartphone className="h-4 w-4 text-purple-600" />;
      case "DEBIT":
      case "CREDIT":
        return <CreditCard className="h-4 w-4 text-indigo-600" />;
      default:
        return <CircleDollarSign className="h-4 w-4 text-surface-600" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="relative flex flex-col w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-surface-100">
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-500 to-indigo-600" />

        <div className="shrink-0 px-6 pt-5 pb-4 border-b border-surface-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-50 text-brand-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-surface-900 leading-tight">
                Setujui Permintaan
              </h2>
              <p className="text-xs text-surface-500 mt-0.5">
                Konfirmasi dan proses pembayaran transaksi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-100 transition-colors text-surface-400 hover:text-surface-700 cursor-pointer"
            aria-label="Tutup"
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-4 overflow-y-auto min-h-0 text-sm">
          <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200/60 text-xs text-amber-800 flex items-start gap-2.5">
            <AlertTriangle
              className="h-4 w-4 text-amber-600 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span className="leading-relaxed font-medium">
              Cocokkan invoice cetak dari sales dengan transaksi pending ini
              sebelum memproses persetujuan.
            </span>
          </div>

          <div className="rounded-xl border border-surface-200 bg-white p-4 space-y-3.5 shadow-sm">
            <div className="flex justify-between items-center pb-2.5 border-b border-surface-100">
              <div>
                <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider block">
                  No. Invoice
                </span>
                <span className="text-sm font-bold text-surface-900 mt-0.5 block">
                  {tx.invoiceNumber}
                </span>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-100 text-surface-700">
                {tx.items.length} barang
              </span>
            </div>

            <div className="space-y-2 py-1">
              <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider block">
                Daftar Produk
              </span>
              <div className="max-h-36 overflow-y-auto pr-1 space-y-2">
                {tx.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 text-xs border-b border-surface-50 pb-1.5 last:border-0 last:pb-0"
                  >
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-surface-100 flex-shrink-0 bg-surface-50">
                      <img
                        src={
                          item.product?.imageUrl ||
                          getDefaultProductImage(item.product?.category?.name)
                        }
                        alt={item.productName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0 flex justify-between items-start">
                      <div className="space-y-0.5 max-w-[70%]">
                        <p className="font-bold text-surface-800 leading-snug truncate">
                          {item.productName}
                        </p>
                        <p className="text-[10px] text-surface-500">
                          {item.quantity}{" "}
                          {item.product?.unit ||
                            item.printingService?.unit ||
                            item.rawMaterialUnit ||
                            "pcs"}
                          {item.size &&
                            ` \u2022 Ukuran: ${item.size.split(" = ")[0]}`}
                          {item.material && ` \u2022 Bahan: ${item.material}`}
                        </p>
                      </div>
                      <span className="font-semibold text-surface-700 tabular-nums text-right flex-shrink-0">
                        {formatRupiah(Number(item.subtotal))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2.5 border-t border-surface-100">
              <div>
                <span className="text-xs font-semibold text-surface-500 block mb-0.5">
                  Pelanggan
                </span>
                <span
                  className="font-bold text-surface-900 block truncate"
                  title={tx.customerName || "Pelanggan Umum"}
                >
                  {tx.customerName || "Pelanggan Umum"}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-surface-500 block mb-0.5">
                  Total Tagihan
                </span>
                <span className="font-bold text-brand-700 text-base block">
                  {formatRupiah(total)}
                </span>
              </div>
            </div>
          </div>

          {!isAlreadyLunas && (
            <label className="flex items-center justify-between p-3.5 rounded-xl border border-surface-200 bg-surface-50 hover:bg-surface-100/50 cursor-pointer transition-all duration-200">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isPayLater}
                  onChange={(e) => setIsPayLater(e.target.checked)}
                  className="rounded border-surface-300 text-brand-600 focus:ring-brand-500 w-4 h-4 cursor-pointer"
                />
                <div>
                  <span className="text-sm font-bold text-surface-955 block">
                    Bayar Nanti (Tempo)
                  </span>
                  <span className="text-xs text-surface-500 block mt-0.5">
                    Tandai transaksi sebagai jatuh tempo (DP)
                  </span>
                </div>
              </div>
            </label>
          )}

          <div
            className={`transition-all duration-200 ${
              isPayLater ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {hasMultiPayment ? (
              <div className="rounded-xl border border-surface-200 p-4 space-y-3 bg-surface-50/50">
                <div className="text-xs font-bold text-surface-500 uppercase tracking-wider pb-2 border-b border-surface-100 flex items-center justify-between">
                  <span>Pembayaran dari Sales</span>
                  <span className="text-brand-600 normal-case font-semibold">
                    {tx.payments && tx.payments.length > 1
                      ? "Metode Multi-payment"
                      : `Metode: ${
                          tx.payments?.[0]?.method === "CASH"
                            ? "Tunai"
                            : tx.payments?.[0]?.method ?? ""
                        }`}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {tx.payments!.map((payment, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center text-sm"
                    >
                      <span className="text-surface-700 flex items-center gap-2 font-medium">
                        {getPaymentIcon(payment.method)}
                        {payment.method === "CASH" ? "Tunai" : payment.method}
                      </span>
                      <span className="font-bold text-surface-900">
                        {formatRupiah(Number(payment.amount))}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-surface-100 flex justify-between items-center text-sm">
                  <span className="font-semibold text-surface-600">
                    Total Dibayar
                  </span>
                  <span className="font-bold text-brand-700">
                    {formatRupiah(multiPaymentTotal)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-surface-600 mb-1.5">
                    Metode Pembayaran
                  </label>
                  <div className="relative">
                    <select
                      value={paymentMethodInput}
                      onChange={(e) => setPaymentMethodInput(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-surface-200 bg-white text-sm font-semibold text-surface-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all appearance-none"
                      disabled={isPayLater}
                    >
                      <option value="CASH">Tunai (Cash)</option>
                      <option value="TRANSFER">Transfer Bank</option>
                      <option value="DEBIT">Kartu Debit</option>
                      <option value="CREDIT">Kartu Kredit</option>
                      <option value="QRIS">QRIS</option>
                    </select>
                    <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-surface-400">
                      <ChevronDown className="h-4 w-4" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-surface-600 mb-1.5">
                    Jumlah Dibayar
                  </label>
                  <div className="relative rounded-xl shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <span className="text-surface-400 text-sm font-semibold">
                        Rp
                      </span>
                    </div>
                    <input
                      type="number"
                      value={isPayLater ? 0 : amountPaidInput}
                      onChange={(e) => setAmountPaidInput(e.target.value)}
                      disabled={isPayLater}
                      placeholder="0"
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm font-bold text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:bg-surface-50 disabled:text-surface-400 transition-all"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-surface-150 bg-surface-50/50 text-sm">
            <span className="font-semibold text-surface-600">
              Status Setelah Disetujui
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                approvalStatus === "Lunas"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {approvalStatus === "Lunas" ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Lunas
                </>
              ) : (
                <>
                  <CircleDollarSign className="h-3.5 w-3.5 text-amber-600" />
                  DP (Tempo)
                </>
              )}
            </span>
          </div>

          {canChangeInvoiceDate && (
            <section className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-surface-600 mb-1.5">
                    Tanggal Invoice (Opsional)
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-600 mb-1.5">
                    Jam Invoice (Opsional)
                  </label>
                  <input
                    type="time"
                    value={invoiceTime}
                    onChange={(e) => setInvoiceTime(e.target.value)}
                    className="w-full rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
              </div>
              <p className="text-xs text-surface-500">
                Jika jam dikosongkan, sistem memakai jam invoice yang sudah ada.
              </p>
              {(invoiceDate || invoiceTime) && (
                <div>
                  <label className="block text-xs font-semibold text-surface-600 mb-1.5">
                    Alasan perubahan tanggal
                  </label>
                  <textarea
                    value={invoiceDateReason}
                    onChange={(e) => setInvoiceDateReason(e.target.value)}
                    placeholder="Contoh: transaksi pending disetujui untuk tanggal invoice sebelumnya"
                    rows={2}
                    className="w-full rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
              )}
            </section>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-surface-100 bg-white flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-semibold text-surface-600 hover:bg-surface-50 transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={handleApprove}
            disabled={approveTx.isPending}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
          >
            {approveTx.isPending ? (
              <>
                <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Memproses...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Setujui
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

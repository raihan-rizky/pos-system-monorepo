"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

import type { Transaction } from "@/hooks/useTransactions";
import { formatRupiah } from "@/lib/utils";
import { useRole } from "@/components/providers/RoleProvider";
import {
  TransactionCartEditor,
  type ApprovalPriceDetails,
  type CartEditorItem,
} from "./TransactionCartEditor";

type ApprovalQuoteResponse = {
  items: Array<ApprovalPriceDetails & {
    input: CartEditorItem;
    unit: string;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  fingerprint: string;
};

function toApprovalCartItem(item: Transaction["items"][number]): CartEditorItem {
  return {
    sourceItemId: item.id,
    serviceNote: item.serviceNote ?? null,
    productId: item.productId ?? null,
    printingServiceId: item.printingServiceId ?? null,
    productName: item.productName,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    originalUnitPrice: Number(item.originalUnitPrice ?? item.unitPrice),
    appliedUnitPrice: Number(item.appliedUnitPrice ?? item.unitPrice),
    subtotal: Number(item.subtotal),
    rawMaterialProductId: item.rawMaterialProductId ?? null,
    rawMaterialQuantity:
      item.rawMaterialQuantity == null ? null : Number(item.rawMaterialQuantity),
    size: item.size ?? null,
    material: item.material ?? null,
    unit:
      item.product?.unit ??
      item.printingService?.unit ??
      item.rawMaterialUnit ??
      "pcs",
  };
}

function quoteItemsFromCart(items: CartEditorItem[]) {
  return items.map((item) => ({
    sourceItemId: item.sourceItemId ?? null,
    serviceNote: item.serviceNote ?? null,
    productId: item.productId,
    printingServiceId: item.printingServiceId ?? null,
    quantity: item.quantity,
    rawMaterialProductId: item.rawMaterialProductId ?? null,
    rawMaterialQuantity: item.rawMaterialQuantity ?? null,
    size: item.size ?? null,
    material: item.material ?? null,
  }));
}

export function ApproveModal({
  tx,
  onClose,
  onSuccess,
}: {
  tx: Transaction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const { role } = useRole();
  const [error, setError] = useState("");
  const [cartItems, setCartItems] = useState<CartEditorItem[]>(() =>
    tx.items.map(toApprovalCartItem),
  );
  const [quote, setQuote] = useState<ApprovalQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [isQuoteLoading, setIsQuoteLoading] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [needsQuoteReview, setNeedsQuoteReview] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceTime, setInvoiceTime] = useState("");
  const [invoiceDateReason, setInvoiceDateReason] = useState("");
  const canChangeInvoiceDate = role === "OWNER" || role === "ADMIN";

  const hasMultiPayment = tx.payments && tx.payments.length > 0;
  const multiPaymentTotal = hasMultiPayment
    ? tx.payments!.reduce((sum, p) => sum + Number(p.amount), 0)
    : 0;

  const total = quote?.total ?? Number(tx.total);
  const [amountPaidInput, setAmountPaidInput] = useState<string>(
    hasMultiPayment
      ? multiPaymentTotal.toString()
      : Number(tx.amountPaid).toString(),
  );
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>(
    tx.paymentMethod || "CASH",
  );
  const parsedAmount = Number(amountPaidInput) || 0;
  const isTempo = paymentMethodInput === "TEMPO";
  const approvalStatus = isTempo
    ? "Tempo/Tagihan"
    : parsedAmount > 0 && parsedAmount < total
      ? "DP"
      : "Lunas";

  const quoteItems = useMemo(() => quoteItemsFromCart(cartItems), [cartItems]);
  const quoteRequestBody = useMemo(
    () => JSON.stringify({ type: "pending", items: quoteItems }),
    [quoteItems],
  );

  useEffect(() => {
    const abortController = new AbortController();
    setQuote(null);
    setQuoteError("");
    setIsQuoteLoading(true);
    setNeedsQuoteReview(false);

    if (cartItems.length === 0) {
      setIsQuoteLoading(false);
      setQuoteError("Tambahkan minimal satu barang sebelum menyetujui.");
      return () => abortController.abort();
    }

    void fetch(`/api/transactions/${tx.id}/approval-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: quoteRequestBody,
      signal: abortController.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.message || "Gagal menghitung harga persetujuan");
        }
        setQuote(body as ApprovalQuoteResponse);
      })
      .catch((fetchError: unknown) => {
        if (abortController.signal.aborted) return;
        setQuoteError(
          fetchError instanceof Error
            ? fetchError.message
            : "Gagal menghitung harga persetujuan",
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) setIsQuoteLoading(false);
      });

    return () => abortController.abort();
  }, [cartItems.length, quoteRequestBody, tx.id]);

  const handleApprove = async () => {
    setError("");
    if (!quote || isQuoteLoading) {
      setError("Tunggu sampai harga terbaru selesai dihitung.");
      return;
    }
    if (needsQuoteReview) {
      setNeedsQuoteReview(false);
      setError("");
      return;
    }
    if (cartItems.length === 0) {
      setError("Tambahkan minimal satu barang sebelum menyetujui.");
      return;
    }
    if (isTempo && !tx.customerId) {
      setError("Pilih pelanggan sebelum menggunakan pembayaran Tempo.");
      return;
    }
    if (!isTempo && parsedAmount <= 0) {
      setError("Jumlah pembayaran harus lebih dari 0.");
      return;
    }

    setIsApproving(true);
    try {
      const response = await fetch(`/api/transactions/${tx.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: quoteItems,
          quoteFingerprint: quote.fingerprint,
          amountPaid: parsedAmount,
          paymentMethod: hasMultiPayment ? tx.paymentMethod || "CASH" : paymentMethodInput,
          ...(canChangeInvoiceDate
            ? {
                invoiceDate: invoiceDate || undefined,
                invoiceTime: invoiceTime || null,
                invoiceDateReason: invoiceDateReason.trim() || null,
              }
            : {}),
        }),
      });

      const body = await response.json();
      if (response.status === 409 && body.code === "APPROVAL_QUOTE_CHANGED") {
        setQuote(body.quote as ApprovalQuoteResponse);
        setNeedsQuoteReview(true);
        setError("Harga atau isi transaksi berubah. Periksa harga terbaru, lalu konfirmasi kembali.");
        return;
      }
      if (!response.ok) throw new Error(body.message || "Gagal menyetujui transaksi");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["transaction-history"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
      ]);
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menyetujui transaksi");
    } finally {
      setIsApproving(false);
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
              <TransactionCartEditor
                items={cartItems}
                onChange={(nextItems) => {
                  setQuote(null);
                  setCartItems(nextItems);
                }}
                priceDetails={quote?.items}
              />
              {(isQuoteLoading || quoteError) && (
                <p className={`mt-2 text-xs ${quoteError ? "text-red-600" : "text-surface-500"}`}>
                  {isQuoteLoading ? "Menghitung harga terbaru..." : quoteError}
                </p>
              )}
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

          <div>
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
                    >
                      <option value="CASH">Tunai (Cash)</option>
                      <option value="TRANSFER">Transfer Bank</option>
                      <option value="DEBIT">Kartu Debit</option>
                      <option value="CREDIT">Kartu Kredit</option>
                      <option value="QRIS">QRIS</option>
                      <option value="TEMPO" disabled={!tx.customerId}>
                        Tempo/Tagihan {!tx.customerId ? "(perlu pelanggan)" : ""}
                      </option>
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
                      value={amountPaidInput}
                      onChange={(e) => setAmountPaidInput(e.target.value)}
                      placeholder="0"
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm font-bold text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:bg-surface-50 disabled:text-surface-400 transition-all"
                    />
                  </div>
                  {isTempo && (
                    <p className="mt-1.5 text-xs text-surface-500">
                      Masukkan pembayaran awal yang benar-benar diterima. Sisanya dicatat sebagai tagihan Tempo.
                    </p>
                  )}
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
                  {approvalStatus}
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
            disabled={isApproving || isQuoteLoading || !quote || cartItems.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
          >
            {isApproving ? (
              <>
                <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Memproses...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {needsQuoteReview ? "Tinjau harga terbaru" : "Setujui"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

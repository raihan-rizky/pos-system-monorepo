"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Banknote, Smartphone, CreditCard, Landmark, X } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import type { Transaction } from "@/hooks/useTransactions";
import { useApproveDraft, useCancelDraft } from "../hooks/useDraftMutations";
import { formatDraftNumberForDisplay } from "../helpers/draft-number";
import { useRole } from "@/components/providers/RoleProvider";
import type { ApprovalPriceDetails, CartEditorItem } from "../../../app/(main)/history/components/TransactionCartEditor";
import { TransactionCartEditor } from "../../../app/(main)/history/components/TransactionCartEditor";

interface ApproveDraftDialogProps {
  draft: Transaction;
  onClose: () => void;
  onSuccess: (approved: Transaction) => void;
}

const PAYMENT_METHODS = [
  { value: "CASH", label: "Tunai", icon: Banknote },
  { value: "QRIS", label: "QRIS", icon: Smartphone },
  { value: "DEBIT", label: "Debit", icon: CreditCard },
  { value: "TRANSFER", label: "Transfer", icon: Landmark },
] as const;

type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"] | "TEMPO";

type DraftApprovalQuote = {
  items: Array<ApprovalPriceDetails & { input: CartEditorItem; unit: string }>;
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
    ...(item.priceIntent ? { priceIntent: item.priceIntent } : {}),
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

async function requestDraftApprovalQuote(
  id: string,
  items: ReturnType<typeof quoteItemsFromCart>,
  signal?: AbortSignal,
): Promise<DraftApprovalQuote> {
  const response = await fetch(`/api/transactions/${id}/approval-quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "draft", items }),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || "Gagal menghitung harga nota");
  }
  return body as DraftApprovalQuote;
}

export function ApproveDraftDialog({
  draft,
  onClose,
  onSuccess,
}: ApproveDraftDialogProps): React.ReactElement {
  const approveDraft = useApproveDraft();
  const cancelDraft = useCancelDraft();
  const { role } = useRole();
  const total = Number(draft.total);
  const displayDraftNumber = draft.draftNumber
    ? formatDraftNumberForDisplay(draft.draftNumber)
    : "—";

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [initialTenderMethod, setInitialTenderMethod] = useState<Exclude<PaymentMethod, "TEMPO">>("CASH");
  const [amountPaid, setAmountPaid] = useState<number>(total);
  const [error, setError] = useState<string | null>(null);
  const [isDP, setIsDP] = useState<boolean>(false);
  const [cartItems, setCartItems] = useState<CartEditorItem[]>(() =>
    draft.items.map(toApprovalCartItem),
  );
  const [quote, setQuote] = useState<DraftApprovalQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [isQuoteLoading, setIsQuoteLoading] = useState(true);
  const [needsQuoteReview, setNeedsQuoteReview] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceTime, setInvoiceTime] = useState("");
  const [invoiceDateReason, setInvoiceDateReason] = useState("");
  const canChangeInvoiceDate = role === "OWNER" || role === "ADMIN";

  const quoteItems = useMemo(() => quoteItemsFromCart(cartItems), [cartItems]);
  const quoteRequestBody = useMemo(() => JSON.stringify(quoteItems), [quoteItems]);
  const isTempo = paymentMethod === "TEMPO";
  const quotedTotal = quote?.total ?? total;
  const existingTenderTotal = Math.min(
    total,
    draft.payments?.reduce((sum, payment) => sum + Number(payment.amount), 0) ??
      (Number(draft.amountPaid) || 0),
  );
  const remaining = quotedTotal - amountPaid;
  const change = amountPaid - total;
  const isPaymentValid = isTempo
    ? Boolean(draft.customerId) && amountPaid >= 0 && amountPaid <= quotedTotal
    : isDP
      ? amountPaid > 0 && amountPaid < quotedTotal
      : amountPaid >= quotedTotal;

  useEffect(() => {
    const controller = new AbortController();
    setIsQuoteLoading(true);
    setQuoteError("");
    requestDraftApprovalQuote(draft.id, quoteItems, controller.signal)
      .then((nextQuote) => {
        setQuote(nextQuote);
        setCartItems(
          nextQuote.items.map(({ input, name, appliedUnitPrice, regular, subtotal, unit }) => ({
            ...input,
            productName: name,
            quantity: input.quantity,
            unitPrice: appliedUnitPrice,
            originalUnitPrice: regular,
            appliedUnitPrice,
            subtotal,
            unit,
          })),
        );
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setQuoteError(
          requestError instanceof Error
            ? requestError.message
            : "Gagal menghitung harga nota",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsQuoteLoading(false);
      });
    return () => controller.abort();
  }, [draft.id, quoteRequestBody]);

  const handleApprove = async () => {
    setError(null);
    if (!quote || isQuoteLoading) return;
    if (isTempo && !draft.customerId) {
      setError("Pilih pelanggan sebelum menggunakan pembayaran Tempo.");
      return;
    }
    try {
      const result = await approveDraft.mutateAsync({
        id: draft.id,
        paymentMethod,
        amountPaid,
        items: quoteItems,
        quoteFingerprint: quote.fingerprint,
        ...(isTempo
          ? {
              payments:
                amountPaid > 0
                  ? [{ method: initialTenderMethod, amount: amountPaid }]
                  : [],
            }
          : {}),
        ...(canChangeInvoiceDate
          ? {
              invoiceDate: invoiceDate || undefined,
              invoiceTime: invoiceTime || null,
              invoiceDateReason: invoiceDateReason.trim() || null,
            }
          : {}),
      });
      onSuccess(result);
    } catch (err) {
      if (err instanceof Error && /berubah/i.test(err.message)) {
        setNeedsQuoteReview(true);
        setError("Harga atau isi nota berubah. Periksa rincian terbaru sebelum menyetujui lagi.");
        void requestDraftApprovalQuote(draft.id, quoteItems)
          .then((nextQuote) => {
            setQuote(nextQuote);
            setCartItems(nextQuote.items.map(({ input, name, appliedUnitPrice, regular, subtotal, unit }) => ({
              ...input,
              productName: name,
              unitPrice: appliedUnitPrice,
              originalUnitPrice: regular,
              appliedUnitPrice,
              subtotal,
              unit,
            })));
          })
          .catch((quoteRequestError: unknown) => {
            setQuoteError(
              quoteRequestError instanceof Error
                ? quoteRequestError.message
                : "Gagal menghitung harga nota",
            );
          });
        return;
      }
      setError(err instanceof Error ? err.message : "Gagal menyetujui nota");
    }
  };

  const handleCancelDraft = async () => {
    setError(null);
    try {
      await cancelDraft.mutateAsync(draft.id);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal membatalkan nota",
      );
    }
  };

  const isPending = approveDraft.isPending || cancelDraft.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-surface-900">
              Setujui Nota Penawaran
            </h2>
            <p className="text-xs text-surface-500 mt-0.5 font-mono">
              {displayDraftNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-2 rounded-xl hover:bg-surface-100 transition-colors text-surface-400 hover:text-surface-700 cursor-pointer"
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[calc(90vh-148px)] overflow-y-auto">
          <section className="rounded-xl bg-surface-50 border border-surface-100 p-3">
            <TransactionCartEditor
              items={cartItems}
              onChange={(items) => {
                setCartItems(items);
                setNeedsQuoteReview(false);
              }}
              priceDetails={quote?.items}
            />
            <div className="mt-3 pt-3 border-t border-surface-200 flex justify-between font-bold text-surface-900">
              <span>Total setelah harga dihitung ulang</span>
              <span className="tabular-nums">{formatRupiah(quotedTotal)}</span>
            </div>
            {isQuoteLoading && (
              <p className="mt-2 text-xs text-surface-500" role="status">
                Menghitung harga terbaru…
              </p>
            )}
            {(quoteError || (needsQuoteReview && error)) && (
              <p className="mt-2 text-xs text-amber-800" role="status">
                {quoteError || error}
              </p>
            )}
          </section>

          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">
              {isTempo ? "Metode pembayaran awal" : "Metode Pembayaran"}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() =>
                    isTempo
                      ? setInitialTenderMethod(m.value)
                      : setPaymentMethod(m.value)
                  }
                  className={`flex flex-col items-center gap-0.5 p-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                    (isTempo ? initialTenderMethod : paymentMethod) === m.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-surface-200 text-surface-600 hover:border-surface-300"
                  }`}
                >
                  <m.icon className="w-4 h-4" aria-hidden="true" />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">
              Tipe Pembayaran
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDP(false);
                  if (isTempo) setPaymentMethod(initialTenderMethod);
                  setAmountPaid(quotedTotal);
                }}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                  !isDP && !isTempo
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-surface-200 text-surface-600 hover:border-surface-300"
                }`}
              >
                Lunas
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDP(true);
                  if (isTempo) setPaymentMethod(initialTenderMethod);
                  setAmountPaid(Math.round(quotedTotal / 2));
                }}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                  isDP && !isTempo
                    ? "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-surface-200 text-surface-600 hover:border-surface-300"
                }`}
              >
                Uang Muka (DP)
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod("TEMPO");
                  setIsDP(false);
                  setAmountPaid(existingTenderTotal);
                }}
                disabled={!draft.customerId}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${
                  isTempo
                    ? "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-surface-200 text-surface-600 hover:border-surface-300"
                }`}
              >
                Tempo/Tagihan
              </button>
            </div>
            {!draft.customerId && (
              <p className="mt-1.5 text-xs text-surface-500">
                Pilih pelanggan pada nota untuk menggunakan Tempo.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="approve-draft-amount"
              className="block text-xs font-semibold text-surface-600 mb-1.5"
            >
              {isTempo ? "Pembayaran awal yang diterima" : isDP ? "Jumlah DP" : "Jumlah Bayar"} (Rp)
            </label>
            <input
              id="approve-draft-amount"
              type="number"
              min={0}
              max={isTempo ? quotedTotal : undefined}
              value={amountPaid}
              onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            />
            {isTempo && (
              <p className="mt-2 text-xs text-surface-500">
                Sisa nilai menjadi piutang pelanggan. Hanya uang yang benar-benar diterima dicatat sebagai pembayaran.
              </p>
            )}
            {amountPaid > 0 && (
              <p
                className={`mt-2 text-xs font-medium ${
                  isDP || isTempo
                    ? "text-amber-700"
                    : change >= 0
                      ? "text-emerald-700"
                      : "text-red-600"
                }`}
              >
                {isDP || isTempo
                  ? `Sisa tagihan: ${formatRupiah(Math.max(0, remaining))}`
                  : change >= 0
                    ? `Kembalian: ${formatRupiah(change)}`
                    : `Kurang: ${formatRupiah(Math.abs(change))}`}
              </p>
            )}
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
                Jika jam dikosongkan, sistem memakai jam dari faktur sementara.
              </p>
              {(invoiceDate || invoiceTime) && (
                <div>
                  <label className="block text-xs font-semibold text-surface-600 mb-1.5">
                    Alasan perubahan tanggal
                  </label>
                  <textarea
                    value={invoiceDateReason}
                    onChange={(e) => setInvoiceDateReason(e.target.value)}
                    placeholder="Contoh: final invoice mengikuti tanggal nota sebelumnya"
                    rows={2}
                    className="w-full rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
              )}
            </section>
          )}

          {error && (
            <p
              role="alert"
              className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
            >
              {error}
            </p>
          )}
        </div>

        <div className="px-6 pb-6 flex items-center justify-between gap-3">
          <div className="flex flex-col items-start">
            <button
              type="button"
              id="approve-draft-cancel"
              onClick={handleCancelDraft}
              disabled={isPending}
              className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Batalkan Nota
            </button>
            <span className="text-[10px] text-surface-500 mt-1 font-medium">
              Aksi ini tidak akan mengubah stok
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="py-2.5 px-4 rounded-xl border border-surface-200 text-sm font-semibold text-surface-600 hover:bg-surface-50 transition-colors disabled:opacity-60 cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              id="approve-draft-confirm"
              onClick={handleApprove}
              disabled={isPending || isQuoteLoading || !quote || !isPaymentValid}
              className="py-2.5 px-4 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {approveDraft.isPending ? "Memproses..." : "Setujui & Simpan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

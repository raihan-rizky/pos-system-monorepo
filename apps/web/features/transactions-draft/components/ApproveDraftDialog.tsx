"use client";

import React, { useState } from "react";
import { formatRupiah } from "@/lib/utils";
import type { Transaction } from "@/hooks/useTransactions";
import { useApproveDraft, useCancelDraft } from "../hooks/useDraftMutations";

interface ApproveDraftDialogProps {
  draft: Transaction;
  onClose: () => void;
  onSuccess: (approved: Transaction) => void;
}

const PAYMENT_METHODS = [
  { value: "CASH", label: "Tunai", icon: "💵" },
  { value: "QRIS", label: "QRIS", icon: "📱" },
  { value: "DEBIT", label: "Debit", icon: "💳" },
  { value: "TRANSFER", label: "Transfer", icon: "🏦" },
] as const;

type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export function ApproveDraftDialog({
  draft,
  onClose,
  onSuccess,
}: ApproveDraftDialogProps): React.ReactElement {
  const approveDraft = useApproveDraft();
  const cancelDraft = useCancelDraft();
  const total = Number(draft.total);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountPaid, setAmountPaid] = useState<number>(total);
  const [error, setError] = useState<string | null>(null);
  const [isDP, setIsDP] = useState<boolean>(false);

  const remaining = total - amountPaid;
  const change = amountPaid - total;
  const isPaymentValid = isDP
    ? amountPaid > 0 && amountPaid < total
    : amountPaid >= total;

  const handleApprove = async () => {
    setError(null);
    try {
      const result = await approveDraft.mutateAsync({
        id: draft.id,
        paymentMethod,
        amountPaid,
      });
      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyetujui draft");
    }
  };

  const handleCancelDraft = async () => {
    setError(null);
    try {
      await cancelDraft.mutateAsync(draft.id);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal membatalkan draft",
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
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-surface-900">
              Setujui Faktur Sementara
            </h2>
            <p className="text-xs text-surface-500 mt-0.5 font-mono">
              {draft.draftNumber ?? "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-2 rounded-xl hover:bg-surface-100 transition-colors text-surface-400 hover:text-surface-700 cursor-pointer"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <section className="rounded-xl bg-surface-50 border border-surface-100 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-surface-500 mb-1">
              Item (terkunci)
            </p>
            <ul className="space-y-1 text-sm">
              {draft.items.map((item) => (
                <li
                  key={item.id}
                  className="flex justify-between text-surface-700"
                >
                  <span className="truncate">
                    {item.productName} × {item.quantity}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatRupiah(Number(item.subtotal))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 pt-2 border-t border-surface-200 flex justify-between font-bold text-surface-900">
              <span>Total</span>
              <span className="tabular-nums">{formatRupiah(total)}</span>
            </div>
          </section>

          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">
              Metode Pembayaran
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value)}
                  className={`flex flex-col items-center gap-0.5 p-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                    paymentMethod === m.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-surface-200 text-surface-600 hover:border-surface-300"
                  }`}
                >
                  <span className="text-base">{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">
              Tipe Pembayaran
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDP(false);
                  setAmountPaid(total);
                }}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                  !isDP
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
                  setAmountPaid(Math.round(total / 2));
                }}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                  isDP
                    ? "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-surface-200 text-surface-600 hover:border-surface-300"
                }`}
              >
                Uang Muka (DP)
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="approve-draft-amount"
              className="block text-xs font-semibold text-surface-600 mb-1.5"
            >
              {isDP ? "Jumlah DP" : "Jumlah Bayar"} (Rp)
            </label>
            <input
              id="approve-draft-amount"
              type="number"
              min={0}
              value={amountPaid || ""}
              onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            />
            {amountPaid > 0 && (
              <p
                className={`mt-2 text-xs font-medium ${
                  isDP
                    ? "text-amber-700"
                    : change >= 0
                      ? "text-emerald-700"
                      : "text-red-600"
                }`}
              >
                {isDP
                  ? `Sisa tagihan: ${formatRupiah(Math.max(0, remaining))}`
                  : change >= 0
                    ? `Kembalian: ${formatRupiah(change)}`
                    : `Kurang: ${formatRupiah(Math.abs(change))}`}
              </p>
            )}
          </div>

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
          <button
            type="button"
            id="approve-draft-cancel"
            onClick={handleCancelDraft}
            disabled={isPending}
            className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Batalkan Draft
          </button>
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
              disabled={isPending || !isPaymentValid}
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

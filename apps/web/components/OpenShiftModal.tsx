"use client";

import React, { useState } from "react";
import { Input, Button } from "@pos/ui";
import { AlertCircle, WalletCards, X } from "lucide-react";
import { useOpenShift } from "@/hooks/useShift";
import { formatRupiah } from "@/lib/utils";

interface OpenShiftModalProps {
  open: boolean;
  onClose?: () => void;
}

export function OpenShiftModal({ open, onClose }: OpenShiftModalProps) {
  const [openingBalance, setOpeningBalance] = useState<string>("0");
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { mutateAsync: openShift, isPending } = useOpenShift();

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    try {
      await openShift({ openingBalance: Number(openingBalance), note });
      if (onClose) onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Gagal membuka shift. Coba lagi.",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" 
        onClick={() => onClose && onClose()} 
      />
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 animate-scale-in">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal buka shift"
            className="absolute top-4 right-4 p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
            <WalletCards className="h-8 w-8 text-brand-600" />
          </div>
          <h2 className="text-xl font-extrabold text-surface-900">Buka Shift Kasir</h2>
          <p className="text-sm text-surface-500 mt-1">
            Masukkan modal awal uang di laci kasir sebelum memulai transaksi.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {submitError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Saldo Awal (Modal)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500 font-medium">Rp</span>
              <Input
                type="number"
                required
                min="0"
                value={openingBalance}
                onChange={(e) => {
                  setOpeningBalance(e.target.value);
                  setSubmitError(null);
                }}
                placeholder="0"
                className="pl-12 text-lg font-bold"
              />
            </div>
            <p className="text-xs text-brand-600 font-medium mt-1.5">
              Diformat: {formatRupiah(Number(openingBalance) || 0)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Catatan (Opsional)
            </label>
            <Input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Cth: Laci uang kurang Rp5.000"
            />
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              variant="primary"
              className="w-full py-3.5 text-base font-bold"
              disabled={isPending}
            >
              {isPending ? "Membuka Shift..." : "Buka Shift Sekarang"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

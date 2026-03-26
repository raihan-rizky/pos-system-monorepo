"use client";

import React, { useState } from "react";
import { Input, Button } from "@pos/ui";
import { useOpenShift } from "@/hooks/useShift";
import { formatRupiah } from "@/lib/utils";

interface OpenShiftModalProps {
  open: boolean;
  onClose?: () => void;
}

export function OpenShiftModal({ open, onClose }: OpenShiftModalProps) {
  const [openingBalance, setOpeningBalance] = useState<string>("0");
  const [note, setNote] = useState("");
  const { mutateAsync: openShift, isPending } = useOpenShift();

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await openShift({ openingBalance: Number(openingBalance), note });
      if (onClose) onClose();
    } catch (error) {
      alert("Gagal membuka shift: " + error);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" 
        onClick={() => onClose && onClose()} 
      />
      <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl p-6 animate-scale-in">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
          >
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0c98e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <h2 className="text-xl font-extrabold text-surface-900">Buka Shift Kasir</h2>
          <p className="text-sm text-surface-500 mt-1">
            Masukkan modal awal uang di laci kasir sebelum memulai transaksi.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
                onChange={(e) => setOpeningBalance(e.target.value)}
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

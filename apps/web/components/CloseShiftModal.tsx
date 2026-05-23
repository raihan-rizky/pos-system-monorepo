"use client";

import React, { useState } from "react";
import { Modal, Input, Button } from "@pos/ui";
import { AlertCircle } from "lucide-react";
import { useCloseShift, useCloseShiftSummary, CashierShift } from "@/hooks/useShift";
import { formatRupiah, formatDate } from "@/lib/utils";

interface CloseShiftModalProps {
  open: boolean;
  onClose: () => void;
  shift: CashierShift | null;
}

export function CloseShiftModal({ open, onClose, shift }: CloseShiftModalProps) {
  const [closingBalance, setClosingBalance] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { mutateAsync: closeShift, isPending } = useCloseShift();
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
  } = useCloseShiftSummary(shift?.id, open && !!shift && !shift.isLocalOnly);

  if (!shift || !open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!closingBalance) {
      setSubmitError("Pemasukan uang fisik wajib diisi.");
      return;
    }

    try {
      await closeShift({
        shiftId: shift.id,
        closingBalance: Number(closingBalance),
        note: note || undefined
      });
      // Sukses
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Gagal menutup shift. Coba lagi.",
      );
    }
  };

  const currentClosing = closingBalance === "" ? 0 : Number(closingBalance);
  const hasClosingInput = closingBalance !== "" && Number.isFinite(currentClosing);
  const expectedBalance = summary?.expectedBalance ?? null;
  const discrepancy =
    hasClosingInput && expectedBalance !== null ? currentClosing - expectedBalance : null;
  const hasDiscrepancy = discrepancy !== null && discrepancy !== 0;
  const moneyOrLoading = (value: number | null) => {
    if (value !== null) return formatRupiah(value);
    return summaryLoading ? "Memuat..." : "-";
  };

  return (
    <Modal open={open} onClose={onClose} title="Tutup Shift Kasir">
      <div className="mb-6 bg-surface-50 rounded-xl p-4 border border-surface-100">
        <h3 className="text-sm font-bold text-surface-900 mb-3">Ringkasan Shift</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-surface-500">Waktu Mulai:</span>
            <span className="font-semibold text-surface-900">{formatDate(shift.openedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-surface-500">Modal Awal Laci:</span>
            <span className="font-semibold text-brand-600">{formatRupiah(shift.openingBalance)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-surface-500">Total transaksi CASH yang terinput:</span>
            <span className="font-semibold text-surface-900">
              {moneyOrLoading(summary?.totalCashTransactions ?? null)}
            </span>
          </div>
          <div className="flex justify-between border-t border-surface-200 pt-2">
            <span className="text-surface-500">Ekspektasi Uang Akhir di Laci:</span>
            <span className="font-extrabold text-surface-900">
              {moneyOrLoading(expectedBalance)}
            </span>
          </div>
        </div>
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
            Uang Fisik di Laci Sekarang
          </label>
          <p className="text-xs text-surface-400 mb-3">Hitung seluruh uang tunai yang ada di dalam laci kasir saat ini.</p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500 font-bold">Rp</span>
            <Input
              type="number"
              required
              min="0"
              value={closingBalance}
              onChange={(e) => {
                setClosingBalance(e.target.value);
                setSubmitError(null);
              }}
              placeholder="0"
              className="pl-12 text-xl font-extrabold h-14"
            />
          </div>
          <p className="text-xs text-brand-600 font-medium mt-1.5">
            Diformat: {formatRupiah(currentClosing)}
          </p>
        </div>

        <div className="rounded-xl border border-surface-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-surface-600">
              Uang Kurang / Lebih
            </span>
            <span
              className={`font-extrabold ${discrepancy === null
                ? "text-surface-400"
                : discrepancy === 0
                  ? "text-success-600"
                  : "text-danger-600"
                }`}
            >
              {discrepancy === null
                ? hasClosingInput
                  ? "Memuat..."
                  : "-"
                : `${discrepancy > 0 ? "+" : ""}${formatRupiah(discrepancy)}`}
            </span>
          </div>
        </div>

        {summaryError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Ringkasan transaksi CASH gagal dimuat. Sistem tetap akan menghitung ulang saat shift ditutup.</span>
          </div>
        )}

        {hasDiscrepancy && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Ada selisih kas sebesar {formatRupiah(Math.abs(discrepancy))}. Periksa apakah ada transaksi yang belum dibuat invoice.
            </span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Catatan (Opsional)
          </label>
          <Input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Cth: Sempat ambil untuk beli minum"
          />
        </div>

        <div className="pt-4 flex gap-3">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1" disabled={isPending}>
            Batal
          </Button>
          <Button type="submit" variant="danger" className="flex-1" disabled={isPending}>
            {isPending ? "Memproses..." : "Akhiri Shift"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

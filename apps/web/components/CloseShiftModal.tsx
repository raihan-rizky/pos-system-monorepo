"use client";

import React, { useState } from "react";
import { Modal, Input, Button } from "@pos/ui";
import { useCloseShift, CashierShift } from "@/hooks/useShift";
import { formatRupiah, formatDate } from "@/lib/utils";

interface CloseShiftModalProps {
  open: boolean;
  onClose: () => void;
  shift: CashierShift | null;
}

export function CloseShiftModal({ open, onClose, shift }: CloseShiftModalProps) {
  const [closingBalance, setClosingBalance] = useState<string>("");
  const [note, setNote] = useState("");
  const { mutateAsync: closeShift, isPending } = useCloseShift();

  if (!shift || !open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingBalance) return alert("Pemasukan uang fisik wajib diisi");
    
    try {
      await closeShift({ 
        shiftId: shift.id, 
        closingBalance: Number(closingBalance), 
        note: note || undefined 
      });
      // Sukses
      onClose();
    } catch (error) {
      alert("Gagal menutup shift: " + error);
    }
  };

  const currentClosing = closingBalance === "" ? 0 : Number(closingBalance);
  // Expected = (ini dihitung ulang di backend, tapi kita bisa estimasi di FE jika kita tarikh transaction data,
  // tapi lebih aman kita kasih tahu "Uang fisik di laci", discrepancy dihitung di API).
  // Sebaiknya kasir blind-close: kasir hanya masukkan fisik, tidak tahu target uang (untuk menghindari kecurangan).
  // Atau kita tampilkan saja modal awal.

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
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
              onChange={(e) => setClosingBalance(e.target.value)}
              placeholder="0"
              className="pl-12 text-xl font-extrabold h-14"
            />
          </div>
          <p className="text-xs text-brand-600 font-medium mt-1.5">
            Diformat: {formatRupiah(currentClosing)}
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

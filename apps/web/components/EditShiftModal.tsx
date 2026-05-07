"use client";

import React, { useState, useEffect } from "react";
import { Modal, Input, Button } from "@pos/ui";
import { useUpdateShift, CashierShift } from "@/hooks/useShift";
import { formatRupiah } from "@/lib/utils";

interface EditShiftModalProps {
  open: boolean;
  onClose: () => void;
  shift: CashierShift | null;
}

export function EditShiftModal({ open, onClose, shift }: EditShiftModalProps) {
  const [openingBalance, setOpeningBalance] = useState<string>("");
  const [closingBalance, setClosingBalance] = useState<string>("");
  const [note, setNote] = useState("");
  const { mutateAsync: updateShift, isPending } = useUpdateShift();

  useEffect(() => {
    if (shift && open) {
      setOpeningBalance(shift.openingBalance.toString());
      setClosingBalance(shift.closingBalance?.toString() || "");
      setNote(shift.note || "");
    }
  }, [shift, open]);

  if (!shift || !open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await updateShift({ 
        id: shift.id, 
        openingBalance: Number(openingBalance),
        closingBalance: closingBalance === "" ? undefined : Number(closingBalance),
        note: note || undefined
      });
      onClose();
    } catch (error) {
      alert("Gagal memperbarui shift: " + error);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Riwayat Shift">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Modal Awal Laci
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500 font-bold">Rp</span>
            <Input
              type="number"
              required
              min="0"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="pl-12"
            />
          </div>
        </div>

        {shift.status === "CLOSED" && (
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Tutup Laci (Uang Fisik)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500 font-bold">Rp</span>
              <Input
                type="number"
                min="0"
                value={closingBalance}
                onChange={(e) => setClosingBalance(e.target.value)}
                className="pl-12"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Catatan
          </label>
          <Input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Masukkan catatan jika ada"
          />
        </div>

        <div className="pt-4 flex gap-3">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1" disabled={isPending}>
            Batal
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={isPending}>
            {isPending ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

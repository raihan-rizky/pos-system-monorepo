"use client";

import { Button, Modal } from "@pos/ui";
import { CheckCircle2 } from "lucide-react";

export function GoodsPurchaseApprovedDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pembelian Barang Telah Disetujui"
      size="sm"
    >
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <p className="text-sm font-semibold text-slate-600">
          Pengeluaran sudah tercatat dan pilihan update HPP sudah diproses.
          Stok tidak berubah.
        </p>
        <Button type="button" onClick={onClose} className="w-full">
          Tutup
        </Button>
      </div>
    </Modal>
  );
}

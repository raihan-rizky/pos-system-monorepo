"use client";

import { Button, Modal } from "@pos/ui";

import type { SupplierListItem } from "@/features/suppliers/types/supplier";

interface SupplierStatusConfirmDialogProps {
  supplier: SupplierListItem | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (supplier: SupplierListItem) => void;
}

export function SupplierStatusConfirmDialog({
  supplier,
  pending,
  onClose,
  onConfirm,
}: SupplierStatusConfirmDialogProps) {
  const nextLabel = supplier?.isActive ? "nonaktifkan" : "aktifkan";

  return (
    <Modal
      open={supplier !== null}
      onClose={onClose}
      title="Konfirmasi Status Supplier"
      size="md"
    >
      {supplier && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-600">
              Supplier yang akan diubah
            </p>
            <p className="mt-1 text-base font-black text-slate-950">
              {supplier.name}
            </p>
          </div>
          <p className="text-sm leading-6 text-slate-600">
            Supplier ini akan di{nextLabel}. Data histori stock-in tetap
            tersimpan dan masih bisa dibaca dari detail supplier.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={pending}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant={supplier.isActive ? "danger" : "primary"}
              loading={pending}
              onClick={() => onConfirm(supplier)}
            >
              {supplier.isActive ? "Nonaktifkan" : "Aktifkan"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

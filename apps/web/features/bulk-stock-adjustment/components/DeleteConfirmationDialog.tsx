"use client";

import React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  selectedCount: number;
  isDeleting: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const DeleteConfirmationDialog = React.forwardRef<
  HTMLDivElement,
  DeleteConfirmationDialogProps
>(({ isOpen, selectedCount, isDeleting, onConfirm, onCancel }, ref) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={ref}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Close button */}
        <button
          onClick={onCancel}
          disabled={isDeleting}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-50"
          aria-label="Tutup dialog"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Icon */}
        <div className="mb-4 flex justify-center">
          <div className="rounded-full bg-red-100 p-3">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
        </div>

        {/* Title */}
        <h2 className="mb-2 text-center text-xl font-bold text-slate-900">
          Hapus {selectedCount} Produk?
        </h2>

        {/* Description */}
        <p className="mb-6 text-center text-sm text-slate-600">
          Tindakan ini tidak bisa dibatalkan. Produk yang dipilih akan dihapus permanen dari inventaris.
        </p>

        {/* Warning */}
        <div className="mb-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">Peringatan</p>
          <p className="mt-1">Semua data terkait termasuk riwayat stok akan ikut dihapus.</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isDeleting ? "Menghapus..." : "Hapus"}
          </button>
        </div>
      </div>
    </div>
  );
});

DeleteConfirmationDialog.displayName = "DeleteConfirmationDialog";

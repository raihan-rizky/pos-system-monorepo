"use client";

import { X } from "lucide-react";

export function TransactionNoteModal({
  note,
  documentNumber,
  onClose,
}: {
  note: string;
  documentNumber?: string | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex flex-col w-full max-w-sm max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-surface-900">Catatan</h2>
            {documentNumber && (
              <p data-testid="note-modal-subtitle" className="text-xs text-surface-500 mt-0.5">
                {documentNumber}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-2 rounded-xl hover:bg-surface-100 transition-colors text-surface-400 hover:text-surface-700"
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 overflow-y-auto min-h-0">
          <p className="text-sm leading-relaxed text-surface-700 whitespace-pre-wrap break-words">
            {note}
          </p>
        </div>
      </div>
    </div>
  );
}

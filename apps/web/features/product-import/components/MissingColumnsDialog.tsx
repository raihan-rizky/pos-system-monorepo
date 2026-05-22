"use client";

import { Modal, Button } from "@pos/ui";
import { AlertTriangle } from "lucide-react";
import { REQUIRED_IMPORT_COLUMNS } from "../types";

export function MissingColumnsDialog({
  open,
  onClose,
  missingColumns,
  unknownColumns,
  suggestions,
}: {
  open: boolean;
  onClose: () => void;
  missingColumns: string[];
  unknownColumns: string[];
  suggestions: Record<string, string>;
}) {
  if (!open || missingColumns.length === 0) return null;

  return (
    <Modal open={open} onClose={onClose} title="Kolom Wajib Belum Ada" size="md">
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-200 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-red-800">
              File ini belum memiliki {missingColumns.length} kolom wajib.
            </p>
            <p className="text-xs text-red-600 mt-1">
              Perbaiki file lalu upload ulang, atau gunakan mapping kolom untuk mengarahkannya.
            </p>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Kolom yang belum ada</p>
          <div className="flex flex-wrap gap-2">
            {missingColumns.map((col) => (
              <span key={col} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-sm font-bold text-red-700">
                {col}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Kolom wajib</p>
          <div className="flex flex-wrap gap-2">
            {REQUIRED_IMPORT_COLUMNS.map((col) => (
              <span
                key={col}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold ${
                  missingColumns.includes(col)
                    ? "bg-red-50 border border-red-200 text-red-700"
                    : "bg-emerald-50 border border-emerald-200 text-emerald-700"
                }`}
              >
                {col}
              </span>
            ))}
          </div>
        </div>

        {Object.keys(suggestions).length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-bold mb-1">Maksudnya ini?</p>
            {Object.entries(suggestions).map(([from, to]) => (
              <p key={from} className="text-xs">
                &quot;{from}&quot; → <span className="font-bold">{to}</span>
              </p>
            ))}
            <p className="text-xs mt-2">Gunakan mapping kolom di langkah berikutnya untuk memperbaiki ini.</p>
          </div>
        )}

        {unknownColumns.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <p className="font-bold mb-1">Kolom tidak dikenal (akan diabaikan)</p>
            <p className="text-xs">{unknownColumns.join(", ")}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>
            Tutup & Perbaiki File
          </Button>
        </div>
      </div>
    </Modal>
  );
}

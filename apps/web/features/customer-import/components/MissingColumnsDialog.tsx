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
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-red-800">
              File ini belum memiliki {missingColumns.length} kolom wajib.
            </p>
            <p className="mt-1 text-xs text-red-600">
              Perbaiki file lalu upload ulang, atau gunakan mapping kolom.
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Kolom yang belum ada
          </p>
          <div className="flex flex-wrap gap-2">
            {missingColumns.map((column) => (
              <span
                key={column}
                className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-bold text-red-700"
              >
                {column}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Kolom wajib
          </p>
          <div className="flex flex-wrap gap-2">
            {REQUIRED_IMPORT_COLUMNS.map((column) => (
              <span
                key={column}
                className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-bold ${
                  missingColumns.includes(column)
                    ? "border border-red-200 bg-red-50 text-red-700"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {column}
              </span>
            ))}
          </div>
        </div>

        {Object.keys(suggestions).length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="mb-1 font-bold">Saran mapping</p>
            {Object.entries(suggestions).map(([from, to]) => (
              <p key={from} className="text-xs">
                "{from}" to <span className="font-bold">{to}</span>
              </p>
            ))}
          </div>
        )}

        {unknownColumns.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <p className="mb-1 font-bold">Kolom tidak dikenal</p>
            <p className="text-xs">{unknownColumns.join(", ")}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </Modal>
  );
}


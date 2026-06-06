"use client";

import React from "react";
import { Button } from "@pos/ui";
import { ArrowRight, Check, X } from "lucide-react";

import {
  IMPORT_COLUMNS,
  REQUIRED_IMPORT_COLUMNS,
  type ColumnMapping,
  type ImportColumn,
} from "../types";
import { getMissingRequiredColumns } from "../helpers/client-parser";

interface ColumnMappingStepProps {
  rawHeaders: string[];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export function ColumnMappingStep({
  rawHeaders,
  mapping,
  onMappingChange,
  onConfirm,
  onBack,
}: ColumnMappingStepProps) {
  const missingRequired = getMissingRequiredColumns(mapping);
  const mappedValues = new Set(Object.values(mapping).filter(Boolean));

  const handleChange = (rawHeader: string, value: string) => {
    onMappingChange({ ...mapping, [rawHeader]: value as ImportColumn | "" });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-800">
        <p className="font-bold">Mapping kolom file ke field supplier.</p>
        <p className="mt-1 text-xs text-blue-600">
          Sesuaikan hasil deteksi otomatis sebelum masuk ke preview.
        </p>
      </div>

      <div className="max-h-[400px] max-w-full overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[620px] w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Kolom File</th>
              <th className="px-4 py-3 text-center w-10">To</th>
              <th className="px-4 py-3 text-left">Dipetakan Ke</th>
              <th className="px-4 py-3 text-center w-16">Status</th>
            </tr>
          </thead>
          <tbody>
            {rawHeaders.map((raw) => {
              const mapped = mapping[raw] || "";
              const isRequired =
                mapped &&
                REQUIRED_IMPORT_COLUMNS.includes(
                  mapped as (typeof REQUIRED_IMPORT_COLUMNS)[number],
                );

              return (
                <tr key={raw} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <span className="inline-flex max-w-[220px] items-center rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-sm font-bold text-slate-700">
                      <span className="truncate">{raw}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-300">
                    <ArrowRight className="mx-auto h-4 w-4" />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={mapped}
                      onChange={(event) => handleChange(raw, event.target.value)}
                      className={`w-full rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                        !mapped
                          ? "border-slate-200 bg-slate-50 text-slate-400"
                          : isRequired
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      <option value="">- Abaikan -</option>
                      {IMPORT_COLUMNS.map((column) => (
                        <option
                          key={column}
                          value={column}
                          disabled={
                            mappedValues.has(column) && mapping[raw] !== column
                          }
                        >
                          {column}
                          {REQUIRED_IMPORT_COLUMNS.includes(
                            column as (typeof REQUIRED_IMPORT_COLUMNS)[number],
                          )
                            ? " *"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {mapped ? (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
                        <Check className="h-4 w-4 text-emerald-600" />
                      </span>
                    ) : (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100">
                        <X className="h-4 w-4 text-slate-400" />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {missingRequired.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span className="font-bold">Kolom wajib belum dimapping: </span>
          {missingRequired.join(", ")}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="secondary" onClick={onBack}>
          Kembali
        </Button>
        <Button
          type="button"
          disabled={missingRequired.length > 0}
          onClick={onConfirm}
        >
          Lanjut ke Preview
        </Button>
      </div>
    </div>
  );
}

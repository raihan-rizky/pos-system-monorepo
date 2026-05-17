"use client";

import React from "react";
import { Button } from "@pos/ui";
import { ArrowRight, Check, X } from "lucide-react";
import { IMPORT_COLUMNS, REQUIRED_IMPORT_COLUMNS, type ColumnMapping, type ImportColumn } from "../types";
import { getMissingRequiredColumns } from "../helpers/client-parser";

export function ColumnMappingStep({
  rawHeaders,
  mapping,
  onMappingChange,
  onConfirm,
  onBack,
}: {
  rawHeaders: string[];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const missingRequired = getMissingRequiredColumns(mapping);
  const mappedValues = new Set(Object.values(mapping).filter(Boolean));

  const handleChange = (rawHeader: string, value: string) => {
    onMappingChange({ ...mapping, [rawHeader]: value as ImportColumn | "" });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-800">
        <p className="font-bold">Map your file columns to product fields.</p>
        <p className="text-xs mt-1 text-blue-600">
          We auto-detected some mappings. Adjust any incorrect ones below.
        </p>
      </div>

      <div className="max-h-[400px] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">File Column</th>
              <th className="px-4 py-3 text-center w-10">→</th>
              <th className="px-4 py-3 text-left">Maps To</th>
              <th className="px-4 py-3 text-center w-16">Status</th>
            </tr>
          </thead>
          <tbody>
            {rawHeaders.map((raw) => {
              const mapped = mapping[raw] || "";
              const isRequired = mapped && REQUIRED_IMPORT_COLUMNS.includes(mapped as typeof REQUIRED_IMPORT_COLUMNS[number]);
              const isIgnored = !mapped;

              return (
                <tr key={raw} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-sm font-mono font-bold text-slate-700">
                      {raw}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-300">
                    <ArrowRight className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={mapped}
                      onChange={(e) => handleChange(raw, e.target.value)}
                      className={`w-full rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                        isIgnored
                          ? "border-slate-200 bg-slate-50 text-slate-400"
                          : isRequired
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      <option value="">— Ignore —</option>
                      {IMPORT_COLUMNS.map((col) => (
                        <option
                          key={col}
                          value={col}
                          disabled={mappedValues.has(col) && mapping[raw] !== col}
                        >
                          {col}
                          {REQUIRED_IMPORT_COLUMNS.includes(col as typeof REQUIRED_IMPORT_COLUMNS[number]) ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {mapped ? (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
                        <Check className="w-4 h-4 text-emerald-600" />
                      </span>
                    ) : (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100">
                        <X className="w-4 h-4 text-slate-400" />
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
          <span className="font-bold">Required columns not mapped: </span>
          {missingRequired.join(", ")}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button type="button" disabled={missingRequired.length > 0} onClick={onConfirm}>
          Continue to Preview
        </Button>
      </div>
    </div>
  );
}

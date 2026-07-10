"use client";

import { useCallback } from "react";
import {
  buildCustomerRecapRange,
  type CustomerRecapPreset,
} from "../helpers/recap-core";
import type { CustomerRecapQuery } from "../types/customer-recap";

interface RecapPeriodPickerProps {
  value: CustomerRecapQuery;
  onChange: (next: CustomerRecapQuery) => void;
}

const PRESETS: Array<{ value: CustomerRecapPreset; label: string }> = [
  { value: "daily", label: "Harian" },
  { value: "weekly", label: "Mingguan" },
  { value: "monthly", label: "Bulanan" },
  { value: "yearly", label: "Tahunan" },
];

export function RecapPeriodPicker({
  value,
  onChange,
}: RecapPeriodPickerProps) {
  const handlePreset = useCallback(
    (preset: CustomerRecapPreset) => {
      onChange(buildCustomerRecapRange(preset));
    },
    [onChange],
  );

  const handleDateChange = useCallback(
    (field: keyof CustomerRecapQuery, nextValue: string) => {
      onChange({ ...value, [field]: nextValue });
    },
    [onChange, value],
  );

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {PRESETS.map((preset) => {
          const range = buildCustomerRecapRange(preset.value);
          const isActive =
            range.dateFrom === value.dateFrom && range.dateTo === value.dateTo;
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => handlePreset(preset.value)}
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold transition ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:w-auto">
        <input
          type="date"
          value={value.dateFrom}
          onChange={(event) => handleDateChange("dateFrom", event.target.value)}
          className="min-w-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        />
        <input
          type="date"
          value={value.dateTo}
          onChange={(event) => handleDateChange("dateTo", event.target.value)}
          className="min-w-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        />
      </div>
    </div>
  );
}

export default RecapPeriodPicker;

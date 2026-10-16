"use client";

import { useEffect, useId, useState } from "react";
import { formatDraftNumberForDisplay } from "../helpers/draft-number";

type DraftNumberFieldProps = {
  open: boolean;
  date?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
};

export function DraftNumberField({ open, date, value, onChange, disabled }: DraftNumberFieldProps) {
  const id = useId();
  const [preview, setPreview] = useState("");
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setPreview("");
    setPreviewError(false);
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    void fetch(`/api/transactions/draft${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nomor otomatis belum tersedia");
        const result: unknown = await response.json();
        if (!result || typeof result !== "object" || !("draftNumber" in result) || typeof result.draftNumber !== "string") {
          throw new Error("Nomor otomatis tidak valid");
        }
        if (!controller.signal.aborted) setPreview(formatDraftNumberForDisplay(result.draftNumber));
      })
      .catch(() => { if (!controller.signal.aborted) setPreviewError(true); });
    return () => controller.abort();
  }, [open, date]);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-surface-700">No. Faktur</label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          name="draftNumber"
          type="text"
          value={value ?? preview}
          onChange={(event) => onChange(event.target.value || null)}
          maxLength={100}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          placeholder="Nomor otomatis saat disimpan"
          className="min-w-0 flex-1 rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <button type="button" onClick={() => onChange(null)} disabled={disabled} className="rounded-xl border border-surface-200 px-3 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50">
          Gunakan otomatis
        </button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-surface-500" aria-live="polite">
        {value !== null ? "Nomor custom akan dipakai pada faktur sementara." : previewError
          ? "Nomor otomatis belum dapat ditampilkan. Nomor tetap dibuat saat disimpan."
          : "Nomor otomatis mengikuti urutan saat disimpan. Ubah kolom ini untuk memakai nomor custom."}
      </p>
    </div>
  );
}

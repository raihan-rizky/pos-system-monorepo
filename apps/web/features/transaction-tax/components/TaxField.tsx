"use client";

import React, { useId } from "react";
import type { useReceiptTax } from "../hooks/useReceiptTax";

export function TaxField({ tax, quotation = false }: { tax: ReturnType<typeof useReceiptTax>; quotation?: boolean }) {
  const id = useId();
  return (
    <form className="space-y-2 print:hidden" onSubmit={event => { event.preventDefault(); void tax.ensureSaved().catch(() => {}); }}>
      <label htmlFor={id} className="block text-sm font-medium text-surface-700">{quotation ? "PPN (%)" : "Pajak (%)"}</label>
      <div className="flex flex-wrap gap-2">
        <input id={id} name="taxRate" type="number" inputMode="decimal" min="0" max="100" step="0.01" required
          value={tax.rateText} onChange={event => tax.setRateText(event.target.value)} disabled={!tax.canEdit || !tax.ready || tax.saving}
          aria-invalid={Boolean(tax.error)} aria-describedby={`${id}-hint${tax.error ? ` ${id}-error` : ""}`}
          className="min-w-0 flex-1 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60" />
        {tax.canEdit && <button type="submit" disabled={!tax.ready || tax.saving || !tax.dirty || tax.invalid}
          className="rounded-lg border border-surface-200 px-3 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50">
          {tax.saving ? "Menyimpan..." : "Simpan Pajak"}
        </button>}
      </div>
      <p id={`${id}-hint`} className="text-xs text-surface-500" aria-live="polite">
        {!tax.ready ? "Memuat pajak tersimpan..." : tax.taxMethod === "DPP_NILAI_LAIN" ? "PPN dihitung dari DPP Nilai Lain (11/12 jumlah setelah diskon)." : "Pajak dihitung dari jumlah setelah diskon."}
        {" "}Perubahan memengaruhi total dan sisa tagihan, serta disimpan sebelum dicetak.
      </p>
      {tax.error && <p id={`${id}-error`} role="alert" className="text-sm text-red-700">{tax.error}</p>}
    </form>
  );
}

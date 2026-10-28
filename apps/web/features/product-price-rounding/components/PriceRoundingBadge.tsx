"use client";

import type { SyntheticEvent } from "react";
import type { PriceRoundingResult } from "../rounding";

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 });
const stopCardAction = (event: SyntheticEvent) => event.stopPropagation();

export function PriceRoundingBadge({ rounding, className = "" }: { rounding?: PriceRoundingResult | null; className?: string }) {
  if (!rounding || rounding.direction === "NONE" || rounding.difference === 0) return null;
  return <details className={`max-w-full text-left text-[11px] font-medium text-surface-700 ${className}`} onClick={stopCardAction} onKeyDown={stopCardAction}>
    <summary className="min-h-11 cursor-pointer rounded-lg px-2 py-2.5 text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
      Dibulatkan ke {rounding.direction === "UP" ? "atas" : "bawah"}
    </summary>
    <dl className="space-y-1 break-words rounded-lg border border-surface-200 bg-surface-50 p-2 tabular-nums">
      <div><dt>Harga asal</dt><dd>{money.format(rounding.originalPrice)}</dd></div>
      <div><dt>Harga final</dt><dd>{money.format(rounding.roundedPrice)}</dd></div>
      <div><dt>Selisih</dt><dd>{rounding.difference > 0 ? "+" : "−"}{money.format(Math.abs(rounding.difference))}</dd></div>
    </dl>
  </details>;
}

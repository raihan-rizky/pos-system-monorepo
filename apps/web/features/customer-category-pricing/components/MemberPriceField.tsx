"use client";

import { useId } from "react";
import { Input } from "@pos/ui";
import { formatRupiah } from "@/lib/utils";
import { SpecialPriceBadge } from "./SpecialPriceBadge";
import { PriceRoundingPreview } from "@/features/product-price-rounding/components/PriceRoundingPreview";
import type { PriceRoundingSettings } from "@/features/product-price-rounding/rounding";

interface MemberPriceFieldProps {
  label: "Harga Agen" | "Harga Dinas";
  sellingPrice: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  roundingSettings?: PriceRoundingSettings;
}

export function MemberPriceField({ label, sellingPrice, value, onChange, disabled, roundingSettings }: MemberPriceFieldProps) {
  const id = useId();
  const isOverride = value.trim() !== "";
  const price = Number.isFinite(sellingPrice) ? sellingPrice : 0;

  return (
    <div role="group" aria-label={`Pengaturan ${label}`} className="min-w-0 space-y-1.5">
      <Input
        id={id}
        name={label === "Harga Agen" ? "hargaAgen" : "hargaDinas"}
        label={label}
        type="number"
        min="0.01"
        step="0.01"
        inputMode="decimal"
        placeholder={String(price)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-describedby={`${id}-status`}
        className={isOverride ? "border-emerald-300 !text-emerald-800" : undefined}
      />
      <div id={`${id}-status`} className="flex flex-wrap items-center gap-1.5 text-xs" aria-live="polite">
        {isOverride ? (
          <>
            <SpecialPriceBadge />
            <span className="font-semibold text-emerald-800">Harga khusus · diatur manual</span>
          </>
        ) : (
          <span className="text-surface-600">Mengikuti harga jual asal · {formatRupiah(price)}</span>
        )}
      </div>
      {isOverride && <p className="text-xs text-surface-500">Harga asal sebelum pembulatan.</p>}
      <PriceRoundingPreview price={isOverride ? value : price} settings={roundingSettings} />
      {isOverride && (
        <button
          type="button"
          aria-label={`Ikuti harga jual untuk ${label}`}
          onClick={() => onChange("")}
          disabled={disabled}
          className="inline-flex min-h-11 items-center text-xs font-semibold text-surface-600 underline underline-offset-4 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50"
        >
          Ikuti harga jual
        </button>
      )}
    </div>
  );
}

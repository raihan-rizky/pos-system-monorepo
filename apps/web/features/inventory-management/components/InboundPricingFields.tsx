"use client";

import React from "react";
import { decimalToRatio, divideRatios, multiplyRatios, roundMoney } from "@/features/product-stock-groups/automatic-pricing";
import { inboundAutoCostRoundingError } from "../helpers/inbound-pricing";
import type { InboundPricingCollectionInput, InboundPricingInput, InboundPricingUnit } from "../types/inventory-management";

export type InboundPricingDraft = {
  productId: string;
  costPrice: string;
  price: string;
  hargaAgen: string;
  hargaDinas: string;
  priceEdited?: boolean;
  costEdited?: boolean;
};

export function pricingDraftForUnit(unit?: InboundPricingUnit): InboundPricingDraft {
  return {
    productId: unit?.productId ?? "",
    costPrice: unit?.costPrice == null ? "" : String(unit.costPrice),
    price: unit ? String(unit.price) : "",
    hargaAgen: unit?.hargaAgen == null ? "" : String(unit.hargaAgen),
    hargaDinas: unit?.hargaDinas == null ? "" : String(unit.hargaDinas),
  };
}

export function isInboundPricingDraftValid(draft: InboundPricingDraft, required: boolean, units?: InboundPricingUnit[]): boolean {
  if (required && !draft.productId) return false;
  if (!draft.productId && [draft.costPrice, draft.price, draft.hargaAgen, draft.hargaDinas].some((value) => value.trim())) return false;
  const valid = (["costPrice", "price", "hargaAgen", "hargaDinas"] as const).every((field) => {
    const raw = draft[field].trim();
    if (!raw) return !required;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 9_999_999_999.99 &&
      Math.abs(value * 100 - Math.round(value * 100)) <= 0.0001;
  });
  return valid && (!required || !units || !inboundAutoCostRoundingError(
    units.find((unit) => unit.productId === draft.productId),
    draft.costPrice.trim() ? Number(draft.costPrice) : null,
  ));
}

export function inboundPricingInputFromDraft(draft: InboundPricingDraft): InboundPricingInput {
  const price = (value: string) => value.trim() === "" ? null : Number(value);
  return {
    productId: draft.productId || null,
    costPrice: price(draft.costPrice),
    price: price(draft.price),
    hargaAgen: price(draft.hargaAgen),
    hargaDinas: price(draft.hargaDinas),
  };
}

export function isUsablePricingUnit(unit: InboundPricingUnit): boolean {
  return unit.isActive !== false && !unit.conversionNeedsReview &&
    Number.isFinite(unit.unitMultiplierToBase) && unit.unitMultiplierToBase > 0;
}

export function isInboundPricingDraftsValid(units: InboundPricingUnit[], drafts: InboundPricingDraft[], required: boolean): boolean {
  const usable = units.filter(isUsablePricingUnit);
  if (required && usable.length === 0) return false;
  return usable.every((unit) => {
    const draft = drafts.find((candidate) => candidate.productId === unit.productId);
    return Boolean(draft && isInboundPricingDraftValid(draft, false) && (!required || draft.price.trim()));
  });
}

export function inboundPricingInputFromDrafts(units: InboundPricingUnit[], drafts: InboundPricingDraft[]): InboundPricingCollectionInput {
  return {
    version: 2,
    units: units.filter(isUsablePricingUnit).map((unit) => {
      const draft = drafts.find((candidate) => candidate.productId === unit.productId) ?? pricingDraftForUnit(unit);
      return { ...inboundPricingInputFromDraft(draft), priceEdited: draft.priceEdited ?? false };
    }),
  };
}

function updateDrafts(units: InboundPricingUnit[], drafts: InboundPricingDraft[], productId: string, field: keyof Pick<InboundPricingDraft, "costPrice" | "price" | "hargaAgen" | "hargaDinas">, raw: string): InboundPricingDraft[] {
  const source = units.find((unit) => unit.productId === productId);
  const next = drafts.map((draft) => draft.productId === productId
    ? { ...draft, [field]: raw, ...(field === "price" ? { priceEdited: true } : {}), ...(field === "costPrice" ? { costEdited: true } : {}) }
    : draft);
  if (!source || (field !== "price" && field !== "costPrice")) return next;
  return next.map((draft) => {
    const follower = units.find((unit) => unit.productId === draft.productId);
    if (!follower || follower.pricingMode !== "AUTO" || follower.pricingSourceProductId !== productId || follower.productId === productId ||
      (field === "price" && (draft.priceEdited || !follower.pricingFactor))) return draft;
    if (!raw.trim() && field === "costPrice") return draft;
    try {
      const conversion = divideRatios(decimalToRatio(follower.unitMultiplierToBase), decimalToRatio(source.unitMultiplierToBase));
      const value = roundMoney(multiplyRatios(decimalToRatio(raw), conversion, ...(field === "price" && follower.pricingFactor ? [follower.pricingFactor] : [])));
      return { ...draft, [field]: String(Number(value)) };
    } catch {
      return draft;
    }
  });
}

export function InboundPricingFields({ units, value, onChange, required, namePrefix }: {
  units: InboundPricingUnit[];
  value: InboundPricingDraft[];
  onChange: (value: InboundPricingDraft[]) => void;
  required: boolean;
  namePrefix: string;
}) {
  const fields = [
    { key: "costPrice", label: "HPP Unit" },
    { key: "price", label: "Harga Jual" },
    { key: "hargaAgen", label: "Harga Jual Agen" },
    { key: "hargaDinas", label: "Harga Jual Dinas" },
  ] as const;
  return (
    <fieldset className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <legend className="px-1 text-xs font-bold text-slate-700">Harga per satuan</legend>
      {units.length === 0 && <p className="text-xs text-rose-700">Data satuan belum tersedia. Muat ulang dan periksa produk.</p>}
      {units.map((unit) => {
        const draft = value.find((candidate) => candidate.productId === unit.productId) ?? pricingDraftForUnit(unit);
        const usable = isUsablePricingUnit(unit);
        const autoCost = unit.pricingMode === "AUTO" && unit.pricingSourceProductId != null && unit.pricingSourceProductId !== unit.productId;
        return <fieldset key={unit.productId} className="rounded-lg border border-slate-200 bg-white p-3">
          <legend className="px-1 text-xs font-bold text-slate-800">Satuan {unit.unit}</legend>
          {!usable && <p className="mb-2 text-xs text-amber-800">{unit.isActive === false ? "Satuan tidak aktif." : "Konversi satuan perlu ditinjau."} Harga tidak dapat diubah langsung di sini.{unit.isActive === false && autoCost ? " Harga otomatis tetap dapat mengikuti perubahan satuan acuan." : ""}</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {fields.map((field) => <label key={field.key} className="text-xs font-bold text-slate-600">
              {field.label}{field.key === "costPrice" && autoCost ? " (otomatis)" : ""}
              <input name={`${namePrefix}.${unit.productId}.${field.key}`} type="number" inputMode="decimal" min={0} max={9_999_999_999.99} step="0.01"
                required={required && usable && field.key === "price"} value={draft[field.key]}
                disabled={!usable || (field.key === "costPrice" && autoCost)}
                onChange={(event) => onChange(updateDrafts(units, value, unit.productId, field.key, event.target.value))}
                placeholder="Belum dicatat" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100 disabled:text-slate-500" />
            </label>)}
          </div>
        </fieldset>;
      })}
      <p className="text-[11px] text-slate-500">{required ? "Harga diperbarui setelah penerimaan disetujui." : "Harga dicatat tanpa memperbarui harga produk."} HPP otomatis mengikuti satuan acuan saat HPP acuannya tersedia.</p>
    </fieldset>
  );
}

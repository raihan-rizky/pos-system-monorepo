"use client";

import React, { useRef } from "react";
import type { InboundPricingInput, InboundPricingUnit } from "../types/inventory-management";

export type InboundPricingDraft = {
  productId: string;
  costPrice: string;
  price: string;
  hargaAgen: string;
  hargaDinas: string;
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

export function isInboundPricingDraftValid(draft: InboundPricingDraft, required: boolean): boolean {
  if (required && !draft.productId) return false;
  if (!draft.productId && [draft.costPrice, draft.price, draft.hargaAgen, draft.hargaDinas].some((value) => value.trim())) return false;
  return (["costPrice", "price", "hargaAgen", "hargaDinas"] as const).every((field) => {
    const raw = draft[field].trim();
    if (!raw) return !required;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 9_999_999_999.99 &&
      Math.abs(value * 100 - Math.round(value * 100)) <= 0.0001;
  });
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

export function InboundPricingFields({
  units,
  value,
  onChange,
  required,
  namePrefix,
}: {
  units: InboundPricingUnit[];
  value: InboundPricingDraft;
  onChange: (value: InboundPricingDraft) => void;
  required: boolean;
  namePrefix: string;
}) {
  const drafts = useRef<Record<string, InboundPricingDraft>>({});
  const fields = [
    { key: "costPrice", label: "HPP Unit" },
    { key: "price", label: "Harga Jual" },
    { key: "hargaAgen", label: "Harga Jual Agen" },
    { key: "hargaDinas", label: "Harga Jual Dinas" },
  ] as const;
  return (
    <fieldset className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <legend className="px-1 text-xs font-bold text-slate-700">Harga per satuan {required ? "(wajib)" : "(opsional)"}</legend>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-bold text-slate-600">
          Satuan
          <select
            name={`${namePrefix}.productId`}
            value={value.productId}
            required={required}
            onChange={(event) => {
              if (value.productId) drafts.current[value.productId] = value;
              const productId = event.target.value;
              onChange(drafts.current[productId] ?? pricingDraftForUnit(units.find((unit) => unit.productId === productId)));
            }}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          >
            <option value="">Pilih satuan</option>
            {units.map((unit) => <option key={unit.productId} value={unit.productId}>{unit.unit}</option>)}
          </select>
        </label>
        {fields.map((field) => (
          <label key={field.key} className="text-xs font-bold text-slate-600">
            {field.label}
            <input
              name={`${namePrefix}.${field.key}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={9_999_999_999.99}
              step="0.01"
              required={required}
              value={value[field.key]}
              disabled={!value.productId}
              onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
              placeholder="Masukkan harga"
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Harga berlaku untuk satu satuan yang dipilih dan diperbarui setelah penerimaan disetujui.</p>
    </fieldset>
  );
}

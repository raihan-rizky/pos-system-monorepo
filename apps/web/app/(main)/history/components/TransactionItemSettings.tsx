"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { discountedLineSubtotal } from "@/features/pos-checkout/helpers/item-discount";
import { orderUnits } from "@/features/pos-product-variants/helpers/unit-order";
import { roundSellingPrice, type PriceRoundingSettings } from "@/features/product-price-rounding/rounding";
import { formatRupiah } from "@/lib/utils";
import type { CartEditorItem } from "./TransactionCartEditor";

const MAX_MONEY = 9_999_999_999.99;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Recalculate the whole-line discount when the quantity, price, or unit changes. */
export function updateEditableLine(item: CartEditorItem, changes: Partial<CartEditorItem>): CartEditorItem {
  const next = { ...item, ...changes };
  const gross = roundMoney(next.appliedUnitPrice * next.quantity);
  const mode = next.discountMode ?? "RP";
  const entered = Math.max(0, Number(next.discountValue ?? next.discount ?? 0));
  const value = mode === "PERCENT" ? Math.min(100, entered) : Math.min(gross, entered);
  const discount = roundMoney(Math.min(gross, mode === "PERCENT" ? gross * value / 100 : value));
  return { ...next, discountMode: mode, discountValue: value, discount, subtotal: discountedLineSubtotal(next.appliedUnitPrice, next.quantity, discount) };
}

type UnitOption = {
  id: string;
  name: string;
  unit: string;
  price: number;
  imageUrl: string | null;
  size: string | null;
  material: string | null;
  unitMultiplierToBase: number;
};

async function loadUnitOptions(productId: string, signal: AbortSignal): Promise<{ baseUnit: string; variants: UnitOption[] } | null> {
  const productResponse = await fetch(`/api/products/${encodeURIComponent(productId)}`, { signal });
  if (!productResponse.ok) throw new Error("Satuan belum bisa dimuat.");
  const product = await productResponse.json() as { data: { stockGroupId?: string | null } };
  if (!product.data.stockGroupId) return null;
  const groupResponse = await fetch(`/api/product-stock-groups/${encodeURIComponent(product.data.stockGroupId)}`, { signal });
  if (!groupResponse.ok) throw new Error("Satuan belum bisa dimuat.");
  return groupResponse.json() as Promise<{ baseUnit: string; variants: UnitOption[] }>;
}

function NumberField({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== input.current) setText(String(value));
  }, [value]);

  return (
    <label className="block min-w-0 space-y-1 text-xs font-semibold text-surface-600">
      <span>{label}</span>
      <input
        ref={input}
        type="number"
        inputMode="decimal"
        min="0"
        max={max}
        step="0.01"
        value={text}
        onChange={(event) => {
          const entered = event.target.value;
          setText(entered);
          const parsed = entered === "" ? 0 : Number(entered);
          if (Number.isFinite(parsed)) onChange(roundMoney(Math.min(max, Math.max(0, parsed))));
        }}
        onBlur={() => setText(String(value))}
        className="w-full rounded-lg border border-surface-200 bg-white px-2.5 py-2 text-sm font-normal text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
    </label>
  );
}

export function TransactionItemSettings({ item, onChange, roundingSettings }: {
  item: CartEditorItem;
  onChange: (item: CartEditorItem) => void;
  roundingSettings: PriceRoundingSettings;
}) {
  const [open, setOpen] = useState(false);
  const units = useQuery({
    queryKey: ["transaction-edit-unit-options", item.productId],
    queryFn: ({ signal }) => loadUnitOptions(item.productId!, signal),
    enabled: open && Boolean(item.productId),
    retry: false,
    staleTime: 30_000,
  });
  const options = units.data ? orderUnits(units.data.variants, units.data.baseUnit) : [];
  const gross = roundMoney(item.appliedUnitPrice * item.quantity);
  const mode = item.discountMode ?? "RP";

  return (
    <details className="mt-2 border-t border-surface-100 pt-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded text-xs font-semibold text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30">
        Harga, diskon &amp; satuan <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </summary>
      <div className="mt-3 space-y-3">
        {item.productId && (
          <div className="space-y-1">
            {units.isLoading ? <p className="text-xs text-surface-500">Memuat satuan...</p> : units.isError ? (
              <p className="text-xs text-red-700">Satuan belum bisa dimuat. <button type="button" className="underline" onClick={() => void units.refetch()}>Coba lagi</button></p>
            ) : options.length > 1 ? (
              <label className="block space-y-1 text-xs font-semibold text-surface-600">
                <span>Satuan</span>
                <select
                  value={item.productId}
                  onChange={(event) => {
                    const selected = options.find((option) => option.id === event.target.value);
                    if (!selected) return;
                    const rounding = roundSellingPrice(Number(selected.price), roundingSettings);
                    onChange(updateEditableLine(item, {
                      productId: selected.id, productName: selected.name, unit: selected.unit,
                      imageUrl: selected.imageUrl, size: selected.size, material: selected.material,
                      unitPrice: rounding.roundedPrice, originalUnitPrice: Number(selected.price),
                      appliedUnitPrice: rounding.roundedPrice, priceRounding: rounding, priceIntent: "AUTOMATIC",
                    }));
                  }}
                  className="w-full rounded-lg border border-surface-200 bg-white px-2.5 py-2 text-sm font-normal text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  {!options.some((option) => option.id === item.productId) && <option value={item.productId}>{item.unit ?? "Satuan saat ini"}</option>}
                  {options.map((option) => <option key={option.id} value={option.id}>{option.unit} • {formatRupiah(roundSellingPrice(Number(option.price), roundingSettings).roundedPrice)}</option>)}
                </select>
              </label>
            ) : <p className="text-xs text-surface-500">Satuan: {item.unit ?? "pcs"}</p>}
          </div>
        )}
        <NumberField label={`Harga per ${item.unit ?? "satuan"} (Rp)`} value={item.appliedUnitPrice} max={Math.floor(MAX_MONEY / item.quantity * 100) / 100} onChange={(price) => onChange(updateEditableLine(item, { unitPrice: price, appliedUnitPrice: price, priceIntent: "MANUAL", priceRounding: null }))} />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2">
          <label className="block space-y-1 text-xs font-semibold text-surface-600">
            <span>Jenis diskon</span>
            <select value={mode} onChange={(event) => {
              const nextMode = event.target.value as "RP" | "PERCENT";
              const nextValue = nextMode === "PERCENT" ? (gross ? roundMoney(Number(item.discount ?? 0) / gross * 100) : 0) : Number(item.discount ?? 0);
              onChange(updateEditableLine(item, { discountMode: nextMode, discountValue: nextValue }));
            }} className="w-full rounded-lg border border-surface-200 bg-white px-2.5 py-2 text-sm font-normal text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
              <option value="RP">Rupiah</option>
              <option value="PERCENT">Persen</option>
            </select>
          </label>
          <NumberField label={mode === "PERCENT" ? "Diskon (%)" : "Diskon item (Rp)"} value={item.discountValue ?? item.discount ?? 0} max={mode === "PERCENT" ? 100 : gross} onChange={(value) => onChange(updateEditableLine(item, { discountValue: value }))} />
        </div>
        <p className="text-xs text-surface-500">Diskon dihitung dari total baris. Harga hanya berlaku untuk transaksi ini.</p>
      </div>
    </details>
  );
}

"use client";

import { useState } from "react";
import { Search, Plus, Minus, Trash2, Check } from "lucide-react";
import { useProducts, type Product } from "@/hooks/useProducts";
import { PriceRoundingBadge } from "@/features/product-price-rounding/components/PriceRoundingBadge";
import { usePriceRoundingSettings } from "@/features/product-price-rounding/hooks/usePriceRoundingSettings";
import { DEFAULT_PRICE_ROUNDING_SETTINGS, roundSellingPrice, type PriceRoundingResult } from "@/features/product-price-rounding/rounding";
import { formatRupiah } from "@/lib/utils";
import Image from "next/image";
import { getDefaultProductImage } from "@/lib/utils";
import { TransactionItemSettings, updateEditableLine } from "./TransactionItemSettings";

export type CartEditorItem = {
  priceIntent?: "AUTOMATIC" | "MANUAL";
  priceRounding?: PriceRoundingResult | null;
  sourceItemId?: string | null;
  serviceNote?: string | null;
  productId: string | null;
  printingServiceId?: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  originalUnitPrice: number;
  appliedUnitPrice: number;
  subtotal: number;
  rawMaterialProductId?: string | null;
  rawMaterialQuantity?: number | null;
  size?: string | null;
  material?: string | null;
  unit?: string | null;
  imageUrl?: string | null;
  categoryName?: string | null;
  discount?: number;
  discountMode?: "RP" | "PERCENT";
  discountValue?: number;
};

export type ApprovalPriceDetails = {
  priceRounding?: PriceRoundingResult | null;
  referencePriceRounding?: { regular: PriceRoundingResult | null; agent: PriceRoundingResult | null; government: PriceRoundingResult | null; special: PriceRoundingResult | null };
  name: string;
  unit?: string;
  modal: number | null;
  regular: number;
  agent: number | null;
  government: number | null;
  special: number | null;
  appliedUnitPrice: number;
  subtotal: number;
};

export function TransactionCartEditor({
  items,
  onChange,
  readOnly,
  priceDetails,
  editableDetails = false,
}: {
  items: CartEditorItem[];
  onChange: (items: CartEditorItem[]) => void;
  readOnly?: boolean;
  priceDetails?: ApprovalPriceDetails[];
  editableDetails?: boolean;
}) {
  const { data: roundingSettings = DEFAULT_PRICE_ROUNDING_SETTINGS } = usePriceRoundingSettings();
  const [search, setSearch] = useState("");
  const { data: products = [], isLoading } = useProducts(search, undefined, {
    limit: 5,
  });

  const handleAddProduct = (p: Product) => {
    const existingIndex = items.findIndex((item) => item.productId === p.id);
    if (existingIndex >= 0) {
      handleUpdateQuantity(existingIndex, items[existingIndex].quantity + 1);
    } else {
      const rounding = roundSellingPrice(Number(p.price), roundingSettings);
      const newItem: CartEditorItem = {
        priceIntent: "AUTOMATIC",
        priceRounding: rounding,
        productId: p.id,
        productName: p.name,
        quantity: 1,
        unitPrice: rounding.roundedPrice,
        originalUnitPrice: Number(p.price),
        appliedUnitPrice: rounding.roundedPrice,
        subtotal: rounding.roundedPrice,
        unit: p.unit,
        imageUrl: p.imageUrl,
        categoryName: p.category?.name,
        discount: 0,
      };
      onChange([...items, newItem]);
    }
    setSearch("");
  };

  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (newQty < 1) return;
    onChange(items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return editableDetails
        ? updateEditableLine(item, { quantity: newQty })
        : { ...item, quantity: newQty, subtotal: Number(item.appliedUnitPrice) * newQty };
    }));
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    onChange(newItems);
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-surface-600 mb-1.5">
        Produk dalam Transaksi
      </label>
      
      {!readOnly && (
        <div className="relative mb-3">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-surface-400" />
          </div>
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-surface-200 bg-surface-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            placeholder="Cari SKU atau nama produk..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          
          {search && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-surface-100 rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {isLoading ? (
                <div className="p-3 text-center text-sm text-surface-500">Mencari...</div>
              ) : products.length > 0 ? (
                products.map((p) => (
                  <div key={p.id}>
                  <button
                    type="button"
                    key={p.id}
                    className="w-full text-left px-3 py-2 hover:bg-surface-50 flex items-center justify-between border-b border-surface-50 last:border-0 transition-colors"
                    onClick={() => handleAddProduct(p)}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {editableDetails && <Image src={p.imageUrl || getDefaultProductImage(p.category?.name)} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg object-cover" />}
                      <div className="min-w-0">
                      <div className="text-sm font-medium text-surface-900">{p.name}</div>
                      <div className="text-xs text-surface-500">{p.sku}</div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-brand-600">
                      {formatRupiah(roundSellingPrice(Number(p.price), roundingSettings).roundedPrice)}
                    </div>
                  </button>
                  <PriceRoundingBadge rounding={roundSellingPrice(Number(p.price), roundingSettings)} />
                  </div>
                ))
              ) : (
                <div className="p-3 text-center text-sm text-surface-500">Produk tidak ditemukan</div>
              )}
            </div>
          )}
        </div>
      )}

        <div className={`space-y-2 ${editableDetails ? "" : "max-h-48 overflow-y-auto pr-1"}`}>
        {items.length === 0 ? (
          <div className="text-center py-4 text-surface-400 text-sm bg-surface-50 rounded-xl border border-surface-100 border-dashed">
            Belum ada produk
          </div>
        ) : (
          items.map((item, index) => (
            <div
              key={`${item.sourceItemId ?? item.productId ?? item.printingServiceId ?? item.productName}-${index}`}
              className="p-3 rounded-xl border border-surface-100 bg-white shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                {editableDetails && <Image src={item.imageUrl || getDefaultProductImage(item.categoryName)} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="text-sm font-semibold text-surface-900 truncate">
                    {item.productName}
                  </div>
                  <div className="text-xs text-brand-600 font-medium mt-0.5">
                    {formatRupiah(priceDetails?.[index]?.appliedUnitPrice ?? item.appliedUnitPrice)}
                  </div>
                  {!priceDetails?.[index] && <PriceRoundingBadge rounding={item.priceRounding} />}
                  <div className="text-[10px] text-surface-500 mt-0.5">
                    {item.quantity} {priceDetails?.[index]?.unit ?? item.unit ?? "pcs"}
                    {item.size ? ` • Ukuran: ${item.size.split(" = ")[0]}` : ""}
                    {item.material ? ` • Bahan: ${item.material}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {!readOnly ? (
                    <div className="flex items-center bg-surface-50 rounded-lg border border-surface-200">
                      <button
                        onClick={() => handleUpdateQuantity(index, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        aria-label={`Kurangi ${item.productName}`}
                        className="p-1 text-surface-500 hover:text-surface-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold text-surface-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleUpdateQuantity(index, item.quantity + 1)}
                        aria-label={`Tambah ${item.productName}`}
                        className="p-1 text-surface-500 hover:text-surface-900 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm font-semibold text-surface-900 bg-surface-50 px-2 py-1 rounded-md">
                      {item.quantity}x
                    </div>
                  )}

                  {!readOnly && (
                    <button
                      onClick={() => handleRemoveItem(index)}
                      aria-label={`Hapus ${item.productName}`}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {editableDetails && !readOnly && (
                <TransactionItemSettings
                  item={item}
                  onChange={(updated) => onChange(items.map((entry, itemIndex) => itemIndex === index ? updated : entry))}
                  roundingSettings={roundingSettings}
                />
              )}

              {priceDetails?.[index] && (
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-surface-100 pt-2 text-[11px]">
                  <PriceFact label="Modal" value={priceDetails[index].modal} />
                  <PriceFact label="Normal" value={priceDetails[index].regular} rounding={priceDetails[index].referencePriceRounding?.regular} />
                  <PriceFact label="Agen" value={priceDetails[index].agent} rounding={priceDetails[index].referencePriceRounding?.agent} />
                  <PriceFact label="Dinas" value={priceDetails[index].government} rounding={priceDetails[index].referencePriceRounding?.government} />
                  <PriceFact label="Harga khusus" value={priceDetails[index].special} rounding={priceDetails[index].referencePriceRounding?.special} />
                  <PriceFact label="Harga berlaku" value={priceDetails[index].appliedUnitPrice} rounding={priceDetails[index].priceRounding} />
                </div>
              )}
              <div className="mt-2 flex justify-between text-xs text-surface-500">
                <span>{item.quantity} × {formatRupiah(priceDetails?.[index]?.appliedUnitPrice ?? item.appliedUnitPrice)}</span>
                <span className="font-semibold text-surface-700">
                  {formatRupiah(priceDetails?.[index]?.subtotal ?? item.subtotal)}
                </span>
              </div>
              {editableDetails && Number(item.discount ?? 0) > 0 && (
                <div className="mt-1 text-xs text-emerald-700">Diskon item −{formatRupiah(Number(item.discount))}</div>
              )}
            </div>
          ))
        )}
      </div>
      
      {items.length > 0 && (
        <div className="flex justify-between items-center pt-3 border-t border-surface-100">
          <span className="text-sm font-medium text-surface-600">Total Produk</span>
          <span className="text-sm font-bold text-surface-900">
            {formatRupiah(items.reduce((sum, i) => sum + Number(i.subtotal), 0))}
          </span>
        </div>
      )}
    </div>
  );
}

function PriceFact({ label, value, rounding }: { label: string; value: number | null; rounding?: PriceRoundingResult | null }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap justify-between gap-2">
        <span className="text-surface-500">{label}</span>
        <span className="font-medium text-surface-700 tabular-nums">
          {value == null ? "—" : formatRupiah(value)}
        </span>
      </div>
      <PriceRoundingBadge rounding={rounding} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { Search, Plus, Minus, Trash2, Check } from "lucide-react";
import { useProducts, type Product } from "@/hooks/useProducts";
import { formatRupiah } from "@/lib/utils";

export type CartEditorItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  originalUnitPrice: number;
  appliedUnitPrice: number;
  subtotal: number;
};

export function TransactionCartEditor({
  items,
  onChange,
  readOnly,
}: {
  items: CartEditorItem[];
  onChange: (items: CartEditorItem[]) => void;
  readOnly?: boolean;
}) {
  const [search, setSearch] = useState("");
  const { data: products = [], isLoading } = useProducts(search, undefined, {
    limit: 5,
  });

  const handleAddProduct = (p: Product) => {
    const existingIndex = items.findIndex((item) => item.productId === p.id);
    if (existingIndex >= 0) {
      handleUpdateQuantity(existingIndex, items[existingIndex].quantity + 1);
    } else {
      const newItem: CartEditorItem = {
        productId: p.id,
        productName: p.name,
        quantity: 1,
        unitPrice: Number(p.price),
        originalUnitPrice: Number(p.price),
        appliedUnitPrice: Number(p.price),
        subtotal: Number(p.price),
      };
      onChange([...items, newItem]);
    }
    setSearch("");
  };

  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (newQty < 1) return;
    const newItems = [...items];
    const item = newItems[index];
    item.quantity = newQty;
    item.subtotal = Number(item.appliedUnitPrice) * newQty;
    onChange(newItems);
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
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 hover:bg-surface-50 flex items-center justify-between border-b border-surface-50 last:border-0 transition-colors"
                    onClick={() => handleAddProduct(p)}
                  >
                    <div>
                      <div className="text-sm font-medium text-surface-900">{p.name}</div>
                      <div className="text-xs text-surface-500">{p.sku}</div>
                    </div>
                    <div className="text-sm font-semibold text-brand-600">
                      {formatRupiah(p.price)}
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-3 text-center text-sm text-surface-500">Produk tidak ditemukan</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="text-center py-4 text-surface-400 text-sm bg-surface-50 rounded-xl border border-surface-100 border-dashed">
            Belum ada produk
          </div>
        ) : (
          items.map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 rounded-xl border border-surface-100 bg-white shadow-sm"
            >
              <div className="flex-1 min-w-0 pr-3">
                <div className="text-sm font-semibold text-surface-900 truncate">
                  {item.productName}
                </div>
                <div className="text-xs text-brand-600 font-medium mt-0.5">
                  {formatRupiah(item.appliedUnitPrice)}
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {!readOnly ? (
                  <div className="flex items-center bg-surface-50 rounded-lg border border-surface-200">
                    <button
                      onClick={() => handleUpdateQuantity(index, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="p-1 text-surface-500 hover:text-surface-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold text-surface-900">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => handleUpdateQuantity(index, item.quantity + 1)}
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
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
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

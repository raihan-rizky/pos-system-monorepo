import React from "react";
import { Product } from "@/hooks/useProducts";
import { Edit2, Archive, AlertCircle, TrendingUp, RefreshCw } from "lucide-react";

interface ProductTableProps {
  products: Product[];
  isLoading: boolean;
  onEdit: (id: string) => void;
  onUpdateStock: (id: string) => void;
}

export default function ProductTable({ products, isLoading, onEdit, onUpdateStock }: ProductTableProps) {
  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-surface-400">
      <RefreshCw className="w-7 h-7 animate-spin text-brand-400" />
      <p className="text-sm">Loading inventory…</p>
    </div>
  );

  if (!products.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-surface-400">
      <div className="w-14 h-14 mb-4 rounded-2xl bg-surface-100 flex items-center justify-center">
        <Archive className="w-7 h-7 text-surface-300" />
      </div>
      <p className="font-semibold text-surface-700 mb-1">No products found</p>
      <p className="text-sm text-surface-400">Add a new product or adjust your filters.</p>
    </div>
  );

  return (
    <div className="w-full">

      {/* ─── DESKTOP TABLE ─── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-surface-100">
              <th className="py-3 px-5 text-[11px] font-semibold text-surface-400 uppercase tracking-widest">Product</th>
              <th className="py-3 px-5 text-[11px] font-semibold text-surface-400 uppercase tracking-widest">Category</th>
              <th className="py-3 px-5 text-[11px] font-semibold text-surface-400 uppercase tracking-widest text-right">Price</th>
              <th className="py-3 px-5 text-[11px] font-semibold text-surface-400 uppercase tracking-widest text-right">Stock</th>
              <th className="py-3 px-5 text-[11px] font-semibold text-surface-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map(product => {
              const isLow = product.stock <= product.minStock;
              return (
                <tr key={product.id} className="group border-b border-surface-50 hover:bg-brand-50/30 transition-colors duration-150">
                  {/* Product Info */}
                  <td className="py-3.5 px-5 align-middle">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-surface-50 border border-surface-100 flex items-center justify-center overflow-hidden shrink-0">
                        {product.imageUrl
                          ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                          : <span className="text-xl">{product.category.icon || "📦"}</span>}
                      </div>
                      <div>
                        <p
                          className="font-semibold text-surface-900 group-hover:text-brand-600 transition-colors cursor-pointer text-sm"
                          onClick={() => onEdit(product.id)}
                        >{product.name}</p>
                        <p className="text-[11px] text-surface-400 mt-0.5">
                          {product.sku}{product.size ? ` · ${product.size}` : ""}{product.material ? ` · ${product.material}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Category */}
                  <td className="py-3.5 px-5 align-middle">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border"
                      style={{
                        backgroundColor: `${product.category.color}18` || "#f3f4f6",
                        color: product.category.color || "#4b5563",
                        borderColor: `${product.category.color}35` || "#e5e7eb",
                      }}
                    >
                      {product.category.icon} {product.category.name}
                    </span>
                  </td>

                  {/* Price */}
                  <td className="py-3.5 px-5 align-middle text-right">
                    <p className="font-semibold text-surface-900 text-sm tabular-nums">
                      {new Intl.NumberFormat("id-ID").format(product.price)}
                    </p>
                    {product.costPrice && (
                      <p className="text-[11px] text-surface-400 mt-0.5 tabular-nums">
                        HPP: {new Intl.NumberFormat("id-ID").format(product.costPrice)}
                      </p>
                    )}
                  </td>

                  {/* Stock */}
                  <td className="py-3.5 px-5 align-middle text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-1.5">
                        {isLow && <AlertCircle className="w-3.5 h-3.5 text-amber-500 animate-pulse" />}
                        <span className={`font-bold tabular-nums text-sm ${isLow ? "text-amber-600" : "text-surface-900"}`}>
                          {product.stock}
                        </span>
                        <span className="text-xs text-surface-400">{product.unit}</span>
                      </div>
                      {isLow && (
                        <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Restock</span>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-5 align-middle text-right">
                    <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <button
                        onClick={() => onUpdateStock(product.id)}
                        title="Update Stock"
                        className="flex items-center justify-center w-8 h-8 rounded-lg text-surface-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                      >
                        <TrendingUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onEdit(product.id)}
                        title="Edit Product"
                        className="flex items-center justify-center w-8 h-8 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── MOBILE CARDS ─── */}
      <div className="flex flex-col gap-2.5 md:hidden p-4">
        {products.map(product => {
          const isLow = product.stock <= product.minStock;
          return (
            <div key={product.id} className="bg-white border border-surface-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-13 h-13 rounded-xl bg-surface-50 border border-surface-100 flex items-center justify-center overflow-hidden shrink-0">
                  {product.imageUrl
                    ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                    : <span className="text-2xl">{product.category.icon || "📦"}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-surface-900 text-sm truncate">{product.name}</p>
                    <button onClick={() => onEdit(product.id)} className="shrink-0 p-1.5 -mt-1 -mr-1 text-surface-400 active:text-brand-600 rounded-lg cursor-pointer">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-surface-400 mt-0.5">SKU: {product.sku}</p>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 mt-2 rounded-md text-[10px] font-semibold border"
                    style={{
                      backgroundColor: `${product.category.color}18` || "#f3f4f6",
                      color: product.category.color || "#4b5563",
                      borderColor: `${product.category.color}35` || "#e5e7eb",
                    }}
                  >
                    {product.category.icon} {product.category.name}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-surface-50 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-widest mb-1">Price</p>
                  <p className="font-bold text-surface-900 text-sm tabular-nums">{new Intl.NumberFormat("id-ID").format(product.price)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-widest mb-1">Stock</p>
                    <div className="flex items-center gap-1 justify-end">
                      {isLow && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                      <span className={`font-bold text-sm tabular-nums ${isLow ? "text-amber-600" : "text-surface-900"}`}>{product.stock}</span>
                      <span className="text-[11px] text-surface-400">{product.unit}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onUpdateStock(product.id)}
                    className="flex items-center justify-center w-10 h-10 min-h-[44px] min-w-[44px] bg-surface-50 hover:bg-emerald-50 active:bg-emerald-100 text-surface-500 hover:text-emerald-600 rounded-xl transition-colors cursor-pointer"
                  >
                    <TrendingUp className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {isLow && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Restock Recommended</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

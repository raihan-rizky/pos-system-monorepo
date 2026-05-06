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
      <div className="flex flex-col gap-3.5 md:hidden p-4">
        {products.map(product => {
          const isLow = product.stock <= product.minStock;
          const isOut = product.stock <= 0;
          return (
            <div 
              key={product.id} 
              className="relative group bg-white rounded-3xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100 hover:border-brand-200 transition-all duration-300"
            >
              <div className="flex gap-4">
                {/* Product Image */}
                <div className="relative shrink-0">
                  <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shadow-sm">
                    {product.imageUrl
                      ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      : <span className="text-3xl">{product.category.icon || "📦"}</span>}
                  </div>
                  {isLow && (
                    <div className={`absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm ${isOut ? 'bg-red-500' : 'bg-amber-500'}`}>
                      <AlertCircle className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </div>

                {/* Product Details */}
                <div className="flex-1 min-w-0 py-0.5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-extrabold text-slate-900 text-[15px] leading-tight truncate pr-2">{product.name}</h3>
                      <p className="text-[10px] font-bold text-slate-400 mt-1 tracking-wider uppercase truncate">{product.sku}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button 
                        onClick={() => onUpdateStock(product.id)}
                        className="p-2.5 bg-slate-50 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 active:bg-emerald-100 rounded-xl transition-all cursor-pointer"
                        title="Update Stock"
                      >
                        <TrendingUp className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => onEdit(product.id)}
                        className="p-2.5 bg-slate-50 text-slate-500 hover:text-brand-600 hover:bg-brand-50 active:bg-brand-100 rounded-xl transition-all cursor-pointer"
                        title="Edit Product"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight border shadow-sm flex items-center gap-1.5"
                      style={{
                        backgroundColor: `${product.category.color}12`,
                        color: product.category.color,
                        borderColor: `${product.category.color}25`,
                      }}
                    >
                      <span>{product.category.icon}</span>
                      <span>{product.category.name}</span>
                    </span>
                    {(product.size || product.material) && (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-50 text-slate-500 text-[10px] font-bold border border-slate-200/60 shadow-sm">
                        {[product.size, product.material].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bento Stats Footer */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="bg-slate-50/60 rounded-2xl p-3 border border-slate-100/80">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Harga Jual</p>
                  <p className="text-[15px] font-black text-slate-900 tabular-nums">
                    {new Intl.NumberFormat("id-ID", { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(product.price)}
                  </p>
                </div>
                <div className={`rounded-2xl p-3 border transition-all duration-300 ${
                  isOut ? "bg-red-50/50 border-red-100/60" : 
                  isLow ? "bg-amber-50/50 border-amber-100/60" : 
                  "bg-emerald-50/40 border-emerald-100/50"
                }`}>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Stok Tersedia</p>
                  <div className="flex items-center justify-between">
                    <p className={`text-[15px] font-black tabular-nums ${
                      isOut ? "text-red-600" : 
                      isLow ? "text-amber-600" : 
                      "text-emerald-600"
                    }`}>
                      {product.stock} <span className="text-[10px] opacity-70 ml-0.5 uppercase tracking-tighter">{product.unit}</span>
                    </p>
                    {isLow && (
                       <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm ${
                         isOut ? "bg-red-600 text-white" : "bg-amber-500 text-white"
                       }`}>
                         {isOut ? "HABIS" : "LOW"}
                       </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

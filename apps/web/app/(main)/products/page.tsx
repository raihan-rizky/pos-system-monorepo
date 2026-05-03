"use client";

import React, { useState } from "react";
import { useProducts, useCategories, Product } from "@/hooks/useProducts";
import { Package, Search, Plus, AlertTriangle, TrendingUp, LayoutGrid, List } from "lucide-react";
import ProductTable from "@/components/inventory/ProductTable";
import ProductFormModal from "@/components/inventory/ProductFormModal";
import StockUpdateModal from "@/components/inventory/StockUpdateModal";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; accent: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 bg-white border border-surface-100 shadow-sm`}>
      <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full ${accent} opacity-10`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-surface-400 uppercase tracking-widest">{label}</p>
          <p className="text-3xl font-extrabold text-surface-900 mt-1.5 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-surface-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl ${accent} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [view, setView] = useState<"table" | "grid">("table");

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockUpdateProductId, setStockUpdateProductId] = useState<string | null>(null);

  const { data: products = [], isLoading } = useProducts(search, categoryId);
  const { data: categories = [] } = useCategories();

  const totalProducts = products.length;
  const lowStock = products.filter(p => p.stock <= p.minStock).length;
  const totalValue = products.reduce((s, p) => s + p.stock * p.price, 0);

  const openAdd = () => { setEditingProductId(null); setIsProductModalOpen(true); };
  const openEdit = (id: string) => { setEditingProductId(id); setIsProductModalOpen(true); };
  const closeProduct = () => { setIsProductModalOpen(false); setEditingProductId(null); };
  const openStock = (id: string) => { setStockUpdateProductId(id); setIsStockModalOpen(true); };
  const closeStock = () => { setIsStockModalOpen(false); setStockUpdateProductId(null); };

  return (
    <div className="flex-1 overflow-y-auto w-full bg-surface-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20 space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-surface-900 tracking-tight">Inventory Hub</h1>
            <p className="text-sm text-surface-500 mt-0.5">Manage products, pricing, and stock levels</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-semibold text-sm shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total Products" value={isLoading ? "—" : totalProducts}
            icon={<Package className="w-5 h-5 text-brand-600" />} accent="bg-brand-100" />
          <StatCard label="Low Stock Alerts" value={isLoading ? "—" : lowStock}
            sub={lowStock > 0 ? "Needs restocking" : "All levels healthy"}
            icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} accent="bg-amber-100" />
          <StatCard label="Inventory Value" value={isLoading ? "—" : fmt(totalValue)}
            icon={<TrendingUp className="w-5 h-5 text-emerald-600" />} accent="bg-emerald-100" />
        </div>

        {/* ── Toolbar ── */}
        <div className="bg-white border border-surface-100 rounded-2xl shadow-sm">
          <div className="p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center border-b border-surface-100">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name, SKU…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 min-h-[44px] bg-surface-50 border border-surface-200 rounded-xl text-sm placeholder:text-surface-400 text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
              />
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-1 p-1 bg-surface-100 rounded-xl shrink-0">
              {([["table", List], ["grid", LayoutGrid]] as const).map(([v, Icon]) => (
                <button key={v} onClick={() => setView(v)} aria-label={v}
                  className={`flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-all duration-150 ${view === v ? "bg-white shadow text-brand-600" : "text-surface-400 hover:text-surface-700"}`}>
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Category filters */}
          <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar">
            <button onClick={() => setCategoryId("")}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${categoryId === "" ? "bg-brand-600 text-white shadow-sm" : "bg-surface-100 text-surface-600 hover:bg-surface-200"}`}>
              All ({products.length})
            </button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setCategoryId(c.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${categoryId === c.id ? "bg-brand-600 text-white shadow-sm" : "bg-surface-100 text-surface-600 hover:bg-surface-200"}`}>
                <span>{c.icon}</span>{c.name}
                <span className="opacity-60">({c._count.products})</span>
              </button>
            ))}
          </div>

          {/* Table / Grid */}
          {view === "table" ? (
            <ProductTable products={products} isLoading={isLoading} onEdit={openEdit} onUpdateStock={openStock} />
          ) : (
            <ProductGrid products={products} isLoading={isLoading} onEdit={openEdit} onUpdateStock={openStock} />
          )}
        </div>
      </div>

      {isProductModalOpen && (
        <ProductFormModal isOpen={isProductModalOpen} onClose={closeProduct} productId={editingProductId} categories={categories} />
      )}
      {isStockModalOpen && stockUpdateProductId && (
        <StockUpdateModal isOpen={isStockModalOpen} onClose={closeStock} product={products.find(p => p.id === stockUpdateProductId)!} />
      )}
    </div>
  );
}

/* ── Grid view (inline, no extra file) ── */
function ProductGrid({ products, isLoading, onEdit, onUpdateStock }: {
  products: Product[];
  isLoading: boolean; onEdit: (id: string) => void; onUpdateStock: (id: string) => void;
}) {
  if (isLoading) return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl bg-surface-100 h-48" />
      ))}
    </div>
  );
  if (!products.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-surface-400">
      <Package className="w-10 h-10 mb-3 text-surface-300" />
      <p className="font-medium text-surface-700">No products found</p>
      <p className="text-sm mt-1">Adjust your search or filters</p>
    </div>
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
      {products.map(p => {
        const isLow = p.stock <= p.minStock;
        return (
          <div key={p.id} onClick={() => onEdit(p.id)}
            className="group relative bg-surface-50 border border-surface-100 hover:border-brand-200 rounded-2xl p-4 cursor-pointer hover:shadow-md transition-all duration-200 flex flex-col gap-3">
            {isLow && (
              <span className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                <AlertTriangle className="w-2.5 h-2.5" /> Low
              </span>
            )}
            <div className="w-14 h-14 rounded-xl bg-white border border-surface-200 flex items-center justify-center overflow-hidden shadow-sm">
              {p.imageUrl
                ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                : <span className="text-2xl">{p.category.icon || "📦"}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-surface-900 text-sm truncate group-hover:text-brand-600 transition-colors">{p.name}</p>
              <p className="text-[11px] text-surface-400 mt-0.5 truncate">SKU: {p.sku}</p>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-surface-100">
              <div>
                <p className="text-xs text-surface-400 mb-0.5">Price</p>
                <p className="text-sm font-bold text-surface-900">{new Intl.NumberFormat("id-ID").format(p.price)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-surface-400 mb-0.5">Stock</p>
                <p className={`text-sm font-bold ${isLow ? "text-amber-600" : "text-surface-900"}`}>{p.stock} <span className="font-normal text-surface-400 text-[11px]">{p.unit}</span></p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { useProducts, useCategories, Product } from "@/hooks/useProducts";
import { Package, Search, Plus, AlertTriangle, TrendingUp, LayoutGrid, List, SlidersHorizontal, ChevronRight } from "lucide-react";
import ProductTable from "@/components/inventory/ProductTable";
import ProductFormModal from "@/components/inventory/ProductFormModal";
import StockUpdateModal from "@/components/inventory/StockUpdateModal";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

function StatCard({ label, value, sub, icon, accent, delay = 0 }: {
  label: string; value: string | number; sub?: React.ReactNode;
  icon: React.ReactNode; accent: string; delay?: number
}) {
  return (
    <div 
      className={`group relative overflow-hidden rounded-[24px] p-6 bg-white/60 backdrop-blur-xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-500`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Decorative blurred blob */}
      <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full ${accent} opacity-20 blur-2xl group-hover:opacity-40 transition-opacity duration-500`} />
      
      <div className="relative flex items-start justify-between z-10">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{label}</p>
          <p className="text-4xl font-black text-slate-900 mt-2 tracking-tight">{value}</p>
          {sub && <p className="text-xs font-medium text-slate-500 mt-2 flex items-center gap-1.5">{sub}</p>}
        </div>
        <div className={`w-14 h-14 rounded-2xl ${accent} flex items-center justify-center shrink-0 shadow-inner ring-1 ring-white/50 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // Default to grid on mobile, table on desktop. We'll manage this via state, but default "grid" is safer for initial mobile load.
  const [view, setView] = useState<"table" | "grid">("grid");

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockUpdateProductId, setStockUpdateProductId] = useState<string | null>(null);

  const { data: products = [], isLoading } = useProducts(search, categoryId);
  const { data: categories = [] } = useCategories();

  const totalProducts = products.length;
  const lowStock = products.filter(p => p.stock <= p.minStock).length;
  const totalValue = products.reduce((s: number, p: Product) => s + p.stock * p.price, 0);

  const openAdd = () => { setEditingProductId(null); setIsProductModalOpen(true); };
  const openEdit = (id: string) => { setEditingProductId(id); setIsProductModalOpen(true); };
  const closeProduct = () => { setIsProductModalOpen(false); setEditingProductId(null); };
  const openStock = (id: string) => { setStockUpdateProductId(id); setIsStockModalOpen(true); };
  const closeStock = () => { setIsStockModalOpen(false); setStockUpdateProductId(null); };

  return (
    <div className="flex-1 overflow-y-auto w-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/50 via-slate-50 to-purple-50/50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-24 space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/50 border border-blue-200/50 text-blue-700 text-xs font-bold tracking-wide mb-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
              </span>
              LIVE INVENTORY
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Products Hub</h1>
            <p className="text-base text-slate-500 font-medium">Manage your catalog, pricing, and monitor stock levels in real-time.</p>
          </div>
          <button
            onClick={openAdd}
            className="group relative flex items-center justify-center gap-2 px-6 py-3.5 w-full md:w-auto rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-[0_8px_20px_rgb(0,0,0,0.16)] hover:shadow-[0_12px_25px_rgb(0,0,0,0.25)] transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" /> 
            <span>Add New Product</span>
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <StatCard 
            label="Total Products" 
            value={isLoading ? "—" : totalProducts}
            icon={<Package className="w-6 h-6 text-blue-600" />} 
            accent="bg-blue-100" 
            delay={0}
          />
          <StatCard 
            label="Low Stock Alerts" 
            value={isLoading ? "—" : lowStock}
            sub={lowStock > 0 ? <><span className="w-2 h-2 rounded-full bg-red-500"></span> Action required</> : <><span className="w-2 h-2 rounded-full bg-emerald-500"></span> All levels healthy</>}
            icon={<AlertTriangle className={`w-6 h-6 ${lowStock > 0 ? "text-red-600 animate-pulse" : "text-amber-600"}`} />} 
            accent={lowStock > 0 ? "bg-red-100" : "bg-amber-100"} 
            delay={100}
          />
          <StatCard 
            label="Inventory Value" 
            value={isLoading ? "—" : fmt(totalValue)}
            icon={<TrendingUp className="w-6 h-6 text-emerald-600" />} 
            accent="bg-emerald-100" 
            delay={200}
          />
        </div>

        {/* ── Main Workspace ── */}
        <div className="bg-white/70 backdrop-blur-2xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-[32px] overflow-hidden flex flex-col">
          
          {/* Toolbar */}
          <div className="p-5 md:p-6 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center border-b border-slate-100/80 bg-white/40">
            {/* Search */}
            <div className="relative flex-1 group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors duration-300" />
              </div>
              <input
                type="text"
                placeholder="Search by name, SKU, or barcode..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-slate-50/50 hover:bg-slate-50 border border-slate-200/60 rounded-2xl text-sm font-medium placeholder:text-slate-400 text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 focus:bg-white transition-all shadow-inner"
              />
            </div>

            {/* Actions & Toggles */}
            <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
              <button className="flex items-center justify-center gap-2 px-4 py-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/60 rounded-2xl text-sm font-bold text-slate-700 transition-colors">
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
              </button>
              
              <div className="flex items-center p-1.5 bg-slate-100/80 rounded-2xl">
                {([["grid", LayoutGrid], ["table", List]] as const).map(([v, Icon]) => (
                  <button 
                    key={v} 
                    onClick={() => setView(v)} 
                    aria-label={v}
                    className={`relative flex items-center justify-center w-11 h-11 rounded-xl font-medium transition-all duration-300 ${view === v ? "text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"}`}
                  >
                    {view === v && (
                      <span className="absolute inset-0 bg-white rounded-xl shadow-[0_2px_8px_rgb(0,0,0,0.08)] pointer-events-none" />
                    )}
                    <Icon className="w-5 h-5 relative z-10" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Category Scroller */}
          <div className="relative border-b border-slate-100/80 bg-slate-50/30">
            {/* Fade gradients for scroll */}
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none"></div>
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none"></div>
            
            <div className="px-5 md:px-6 py-4 flex gap-3 overflow-x-auto no-scrollbar snap-x relative z-0">
              <button 
                onClick={() => setCategoryId("")}
                className={`snap-start shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 cursor-pointer ${categoryId === "" ? "bg-slate-900 text-white shadow-md shadow-slate-900/20 scale-100" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 scale-95 hover:scale-100"}`}
              >
                All Products <span className={`ml-1.5 px-2 py-0.5 rounded-md text-[10px] ${categoryId === "" ? "bg-white/20" : "bg-slate-100"}`}>{products.length}</span>
              </button>
              {categories.map(c => (
                <button 
                  key={c.id} 
                  onClick={() => setCategoryId(c.id)}
                  className={`snap-start shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 cursor-pointer ${categoryId === c.id ? "bg-slate-900 text-white shadow-md shadow-slate-900/20 scale-100" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 scale-95 hover:scale-100"}`}
                >
                  <span className="text-base">{c.icon}</span>
                  {c.name}
                  <span className={`px-2 py-0.5 rounded-md text-[10px] ${categoryId === c.id ? "bg-white/20" : "bg-slate-100"}`}>{c._count.products}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Content Area */}
          <div className="bg-slate-50/50 min-h-[400px]">
            {view === "table" ? (
              <div className="hidden md:block">
                <ProductTable products={products} isLoading={isLoading} onEdit={openEdit} onUpdateStock={openStock} />
              </div>
            ) : null}
            
            {(view === "grid" || (view === "table" && typeof window !== 'undefined' && window.innerWidth < 768)) ? (
              <ProductGrid products={products} isLoading={isLoading} onEdit={openEdit} onUpdateStock={openStock} />
            ) : null}
            
            {/* Fallback info for mobile table view */}
            {view === "table" && typeof window !== 'undefined' && window.innerWidth < 768 && (
              <div className="md:hidden w-full text-center py-2 text-xs text-slate-400 bg-slate-100 border-b border-slate-200">
                Switched to grid view for mobile screens
              </div>
            )}
          </div>
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

/* ── Redesigned Grid View ── */
function ProductGrid({ products, isLoading, onEdit, onUpdateStock }: {
  products: Product[];
  isLoading: boolean; onEdit: (id: string) => void; onUpdateStock: (id: string) => void;
}) {
  if (isLoading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 p-5 md:p-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-[24px] bg-white border border-slate-100 h-64 p-5 flex flex-col">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 mb-4" />
          <div className="h-5 w-3/4 bg-slate-100 rounded-md mb-2" />
          <div className="h-4 w-1/2 bg-slate-100 rounded-md mb-auto" />
          <div className="flex justify-between mt-4 pt-4 border-t border-slate-50">
            <div className="h-6 w-20 bg-slate-100 rounded-md" />
            <div className="h-6 w-16 bg-slate-100 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
  
  if (!products.length) return (
    <div className="flex flex-col items-center justify-center py-32 text-slate-400 px-4 text-center">
      <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center mb-6 shadow-inner">
        <Package className="w-10 h-10 text-slate-300" />
      </div>
      <p className="text-xl font-black text-slate-700">No products found</p>
      <p className="text-sm font-medium mt-2 max-w-md">We couldn't find anything matching your current filters. Try adjusting your search term or category.</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 p-5 md:p-6">
      {products.map(p => {
        const isLow = p.stock <= p.minStock;
        return (
          <div 
            key={p.id} 
            onClick={() => onEdit(p.id)}
            className="group bg-white rounded-[24px] p-5 cursor-pointer border border-slate-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_12px_30px_rgb(0,0,0,0.08)] hover:border-blue-200 transition-all duration-300 flex flex-col gap-4 relative overflow-hidden"
          >
            {/* Hover Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-blue-400/20 blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            <div className="flex items-start justify-between relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/80 flex items-center justify-center overflow-hidden shadow-sm group-hover:scale-105 transition-transform duration-300">
                {p.imageUrl
                  ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                  : <span className="text-3xl drop-shadow-sm">{p.category?.icon || "📦"}</span>}
              </div>
              
              {isLow && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 border border-red-100 text-red-600 text-[11px] font-bold tracking-wide shadow-sm animate-pulse">
                  <AlertTriangle className="w-3 h-3" /> LOW STOCK
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0 mt-1 relative z-10">
              <p className="font-black text-slate-800 text-lg truncate group-hover:text-blue-600 transition-colors">{p.name}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold tracking-wider">SKU: {p.sku}</span>
                {p.size && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold">{p.size}</span>}
              </div>
            </div>

            <div className="flex items-end justify-between pt-4 mt-2 border-t border-slate-100 relative z-10">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Price</p>
                <p className="text-lg font-black text-slate-900 tracking-tight">{fmt(p.price)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">In Stock</p>
                <div className={`inline-flex items-baseline gap-1 ${isLow ? "text-red-600" : "text-emerald-600"}`}>
                  <span className="text-lg font-black">{p.stock}</span>
                  <span className="text-xs font-bold opacity-70">{p.unit}</span>
                </div>
              </div>
            </div>
            
            {/* Quick action hint */}
            <div className="absolute bottom-4 right-4 translate-y-10 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

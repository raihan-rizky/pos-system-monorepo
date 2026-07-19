"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import { useProducts, type Product } from "@/hooks/useProducts";
import { useDebounce } from "@/hooks/useDebounce";
import { ProductStockThumbnail } from "@/features/inventory-management/components/ProductStockThumbnail";

interface ProductAutocompleteProps {
  onSelect: (product: Product) => void;
  placeholder?: string;
}

export function ProductAutocomplete({
  onSelect,
  placeholder = "Cari produk (nama / SKU)...",
}: ProductAutocompleteProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // useProducts uses its own internal debounce for the API call
  const products = useProducts(search, undefined, { limit: 20 });
  const results = products.data ?? [];

  // Handle click outside to close the dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelect = (product: Product) => {
    onSelect(product);
    setSearch("");
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="min-h-11 w-full rounded-xl border border-slate-200 pl-10 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          placeholder={placeholder}
          aria-label="Cari produk"
        />
        {products.isFetching && (
          <div className="absolute right-3 top-3">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        )}
      </div>

      {isOpen && search.trim() !== "" && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-[40vh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {products.isFetching && results.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              Mencari produk...
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              Produk tidak ditemukan
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {results.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(product)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-200 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                  >
                    <ProductStockThumbnail name={product.name} imageUrl={product.imageUrl} categoryName={product.category?.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate font-bold text-slate-900">{product.name}</span>
                        <span className="whitespace-nowrap text-xs font-semibold text-slate-500">Sisa: {product.stock} {product.unit}</span>
                      </div>
                      <span className="text-xs text-slate-500">SKU: {product.sku}</span>
                      {product.stockGroup && <span className="ml-2 text-[10px] font-bold text-cyan-700">{product.stockGroup.displayName}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

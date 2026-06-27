"use client";

import React, { useState, useEffect, useRef } from "react";
import { Modal, Button } from "@pos/ui";
import { AlertCircle, Search, X, Plus, Minus, PackageMinus, ShoppingCart, Send } from "lucide-react";
import { createInternalUseStockLog } from "../api/inventory-management-api";

interface InternalStockOutModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  stock: number;
  unit: string;
}

export function InternalStockOutModal({
  open,
  onClose,
  onSuccess,
}: InternalStockOutModalProps) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (open) {
      setCartItems([]);
      setReason("");
      setSearchQuery("");
      setSearchResults([]);
      setError(null);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery);
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/products?search=${encodeURIComponent(query)}&limit=10`
      );
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.data || []);
        setShowResults(true);
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const addToCart = (product: Product) => {
    const existing = cartItems.find((item) => item.productId === product.id);
    if (existing) {
      setCartItems(
        cartItems.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCartItems([
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unit: product.unit,
        },
        ...cartItems, 
      ]);
    }
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
    searchInputRef.current?.focus();
  };

  const removeFromCart = (productId: string) => {
    setCartItems(cartItems.filter((item) => item.productId !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCartItems(
      cartItems
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) {
      setError("Tambahkan minimal 1 produk ke keranjang.");
      return;
    }
    if (!reason.trim()) {
      setError("Alasan wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      for (const item of cartItems) {
        await createInternalUseStockLog({
          productId: item.productId,
          quantity: item.quantity,
          reason: reason.trim(),
        });
      }
      onSuccess(
        `${cartItems.length} log stok pending berhasil dibuat.`
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim permintaan");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.search-container')) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <Modal open={open} onClose={onClose} title="Stock Out Internal" size="2xl">
      <form onSubmit={handleSubmit} className="flex flex-col h-[75vh] max-h-[700px]">
        
        {/* Header & Search Area - Fixed at top */}
        <div className="shrink-0 space-y-4 pb-4 border-b border-surface-100">
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-3">
            <div className="mt-0.5 bg-amber-100 p-1.5 rounded-lg text-amber-700 shrink-0">
              <PackageMinus className="h-4 w-4" />
            </div>
            <p className="text-sm text-amber-900 leading-relaxed">
              Tambahkan produk ke keranjang pemakaian internal.
              <strong> Submit membuat log stok pending</strong> dengan alasan USAGE untuk direview owner.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700 animate-in fade-in slide-in-from-top-1"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="relative search-container z-20">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-5 w-5 text-surface-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => {
                  if (searchQuery.trim() && searchResults.length > 0) {
                    setShowResults(true);
                  }
                }}
                className="h-12 w-full rounded-xl border-2 border-surface-200 pl-11 pr-4 text-base outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all bg-surface-50 focus:bg-white text-surface-900 placeholder:text-surface-400"
                placeholder="Cari nama produk atau scan barcode/SKU..."
              />
              {isSearching && (
                <div className="absolute right-3">
                  <div className="h-5 w-5 rounded-full border-2 border-surface-200 border-t-brand-500 animate-spin" />
                </div>
              )}
            </div>

            {showResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-surface-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                <div className="max-h-[280px] overflow-y-auto py-1">
                  {searchResults.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product)}
                      className="w-full px-4 py-3 text-left hover:bg-surface-50 flex items-center justify-between group transition-colors border-b border-surface-50 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-bold text-surface-900 group-hover:text-brand-600 transition-colors">
                          {product.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-semibold text-surface-500 bg-surface-100 px-2 py-0.5 rounded-md">
                            {product.sku}
                          </span>
                          <span className="text-xs text-surface-500">
                            Stok: <span className="font-semibold text-surface-700">{product.stock} {product.unit}</span>
                          </span>
                        </div>
                      </div>
                      <div className="h-8 w-8 rounded-full bg-surface-100 flex items-center justify-center group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                        <Plus className="h-4 w-4" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {showResults && searchQuery.trim() && searchResults.length === 0 && !isSearching && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-surface-200 rounded-xl shadow-xl p-6 text-center text-surface-500">
                Produk tidak ditemukan.
              </div>
            )}
          </div>
        </div>

        {/* Cart Area - Scrollable */}
        <div className="flex-1 overflow-y-auto py-4 min-h-[200px] flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-surface-900 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-surface-400" />
              Keranjang Stock Out
            </h3>
            {cartItems.length > 0 && (
              <span className="px-2.5 py-0.5 bg-brand-100 text-brand-700 text-xs font-bold rounded-full">
                {cartItems.length} Produk
              </span>
            )}
          </div>

          {cartItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-surface-400 bg-surface-50/50 rounded-xl border-2 border-dashed border-surface-200">
              <ShoppingCart className="h-12 w-12 opacity-20 mb-3" strokeWidth={1.5} />
              <p className="text-sm font-medium text-surface-600">Keranjang masih kosong</p>
              <p className="text-xs mt-1 text-surface-500">Cari produk di atas untuk menambah ke keranjang</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cartItems.map((item) => (
                <div
                  key={item.productId}
                  className="group flex items-start gap-3 p-3 rounded-xl bg-surface-50 border border-surface-100 hover:border-brand-200 transition-all animate-in slide-in-from-bottom-2 fade-in"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-surface-900 truncate">
                      {item.productName}
                    </p>
                    <p className="text-xs text-surface-500 mt-1">Satuan: {item.unit}</p>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId)}
                      className="p-0.5 text-surface-300 hover:text-danger-500 transition-colors"
                      title="Hapus dari keranjang"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    
                    <div className="flex items-center gap-1.5 mt-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, -1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-surface-200 text-surface-600 hover:bg-surface-100 text-sm font-bold transition-colors shadow-sm"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold text-surface-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-surface-200 text-surface-600 hover:bg-surface-100 text-sm font-bold transition-colors shadow-sm"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Area - Fixed at bottom */}
        <div className="shrink-0 pt-4 border-t border-surface-100 space-y-4 bg-white mt-auto">
          <div>
            <label className="block text-sm font-bold text-surface-900 mb-2">
              Alasan Stock Out <span className="text-danger-500">*</span>
            </label>
            <textarea
              name="reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full resize-none rounded-xl border-2 border-surface-200 px-4 py-3 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all bg-surface-50 focus:bg-white text-surface-900 placeholder:text-surface-400"
              placeholder="Contoh: Barang rusak saat dipajang, Expired, Dipakai untuk keperluan toko..."
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="w-32 py-2.5 h-auto text-sm font-bold cursor-pointer"
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button
              type="submit"
              className="w-48 py-2.5 h-auto text-sm font-bold bg-surface-900 text-white hover:bg-surface-800 cursor-pointer shadow-md shadow-surface-900/10 flex items-center justify-center gap-2"
              disabled={isSubmitting || cartItems.length === 0}
            >
              {isSubmitting ? (
                "Memproses..."
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Kirim Permintaan
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

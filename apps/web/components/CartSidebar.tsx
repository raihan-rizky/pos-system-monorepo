"use client";

import React from "react";
import { Button } from "@pos/ui";
import { CreditCard, FileText } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import type { CartItem } from "@/hooks/useCart";
import type { QuotationCheckoutMode } from "@/features/nota-penawaran/helpers/quotation-rules";

interface CartSidebarProps {
  items: CartItem[];
  subtotal: number;
  totalItems: number;
  onUpdateQuantity: (cartLineId: string, quantity: number) => void;
  onRemoveItem: (cartLineId: string) => void;
  onClearCart: () => void;
  onCheckout: () => void;
  checkoutMode?: QuotationCheckoutMode;
  onClose?: () => void;
}

export function CartSidebar({
  items,
  subtotal,
  totalItems,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onCheckout,
  checkoutMode = "payment",
  onClose,
}: CartSidebarProps) {
  const isQuotationMode = checkoutMode === "quotation";

  return (
    <div className="flex flex-col h-full bg-white border-l border-surface-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 -ml-1 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors"
              aria-label="Tutup keranjang"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600">
            <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
          </svg>
          <h2 className="font-bold text-surface-900">Keranjang</h2>
          {totalItems > 0 && (
            <span className="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-bold rounded-full">
              {totalItems}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button
            onClick={onClearCart}
            className="text-xs text-danger-500 hover:text-danger-600 font-medium transition-colors"
          >
            Hapus Semua
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-surface-400">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
            </svg>
            <p className="text-sm mt-2">Keranjang kosong</p>
            <p className="text-xs mt-1">Klik produk untuk menambahkan</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.cartLineId}
                className="flex items-start gap-3 p-3 rounded-xl bg-surface-50 animate-slide-up"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-surface-900 truncate">
                    {item.name}
                  </p>
                  {(item.size || item.material) && (
                    <p className="text-[10px] text-brand-600 mt-0.5 truncate">
                      {[item.size, item.material].filter(Boolean).join(" • ")}
                    </p>
                  )}
                  <p className="text-xs text-surface-400 mt-0.5">
                    {formatRupiah(item.price)} /{item.unit}
                  </p>
                  <p className="text-sm font-bold text-brand-600 mt-1">
                    {formatRupiah(item.price * item.quantity)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <button
                    onClick={() => onRemoveItem(item.cartLineId)}
                    className="p-0.5 text-surface-300 hover:text-danger-500 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onUpdateQuantity(item.cartLineId, item.quantity - 1)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-surface-200 text-surface-600 hover:bg-surface-100 text-sm font-bold transition-colors"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-surface-900">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(item.cartLineId, item.quantity + 1)}
                      disabled={item.lineType === "PRODUCT" && item.quantity >= item.stock}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-surface-200 text-surface-600 hover:bg-surface-100 text-sm font-bold transition-colors disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer - Totals */}
      {items.length > 0 && (
        <div className="border-t border-surface-100 px-4 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-surface-500">Subtotal</span>
            <span className="text-lg font-extrabold text-surface-900">
              {formatRupiah(subtotal)}
            </span>
          </div>
          <Button
            variant="accent"
            size="lg"
            className="w-full"
            onClick={onCheckout}
          >
            {isQuotationMode ? <FileText size={18} /> : <CreditCard size={18} />}
            {isQuotationMode ? "Create Nota Penawaran" : "Bayar"}
          </Button>
        </div>
      )}
    </div>
  );
}

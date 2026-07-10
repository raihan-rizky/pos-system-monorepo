"use client";

import React from "react";
import { Button } from "@pos/ui";
import { CreditCard, DollarSign, FileText, PackageMinus, Pencil, ShoppingCart, X } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import type { CartItem, ProductCartItem } from "@/hooks/useCart";
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
  onInternalStockOut?: () => void;
  canQuickEdit?: boolean;
  quickEditEnabled?: boolean;
  onToggleQuickEdit?: () => void;
  onEditProduct?: (item: ProductCartItem) => void;
  onEditPrice?: (item: ProductCartItem) => void;
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
  onInternalStockOut,
  canQuickEdit = false,
  quickEditEnabled = false,
  onToggleQuickEdit,
  onEditProduct,
  onEditPrice,
}: CartSidebarProps) {
  const isQuotationMode = checkoutMode === "quotation";
  const hasProductItems = items.some((item) => item.lineType === "PRODUCT");

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
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <ShoppingCart className="h-5 w-5 text-brand-600" aria-hidden="true" />
          <h2 className="font-bold text-surface-900">Keranjang</h2>
          {totalItems > 0 && (
            <span className="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-bold rounded-full">
              {totalItems}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {canQuickEdit && hasProductItems && onToggleQuickEdit && (
            <button
              type="button"
              onClick={onToggleQuickEdit}
              aria-pressed={quickEditEnabled}
              aria-label={quickEditEnabled ? "Nonaktifkan Edit Cepat" : "Aktifkan Edit Cepat"}
              title={quickEditEnabled ? "Nonaktifkan Edit Cepat" : "Aktifkan Edit Cepat"}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                quickEditEnabled
                  ? "bg-brand-100 text-brand-700"
                  : "text-surface-400 hover:bg-surface-100 hover:text-surface-700"
              }`}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {items.length > 0 && (
            <button
              onClick={onClearCart}
              className="text-xs text-danger-500 hover:text-danger-600 font-medium transition-colors"
            >
              Hapus Semua
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-surface-400">
            <ShoppingCart className="h-10 w-10 opacity-40" strokeWidth={1.5} aria-hidden="true" />
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
                  {item.lineType === "PRODUCT" && item.transactionPrice != null && (
                    <div className="mt-1 text-[10px] font-medium text-brand-700">
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 font-bold">
                        Harga khusus
                      </span>
                      <span className="ml-1">Hanya berlaku untuk transaksi ini</span>
                    </div>
                  )}
                  {item.lineType === "PRODUCT" && (
                    <dl className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-surface-500">
                      <div>
                        <dt className="font-semibold">Normal</dt>
                        <dd>{formatRupiah(item.catalogPrice)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Agen</dt>
                        <dd>
                          {item.hargaAgen != null && item.hargaAgen > 0
                            ? formatRupiah(item.hargaAgen)
                            : "Belum diatur"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Dinas</dt>
                        <dd>
                          {item.hargaDinas != null && item.hargaDinas > 0
                            ? formatRupiah(item.hargaDinas)
                            : "Belum diatur"}
                        </dd>
                      </div>
                    </dl>
                  )}
                  <p className="text-sm font-bold text-brand-600 mt-1">
                    {formatRupiah(item.price * item.quantity)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1">
                    {quickEditEnabled && item.lineType === "PRODUCT" && onEditProduct && (
                      <button
                        type="button"
                        onClick={() => onEditProduct(item)}
                        aria-label={`Ubah produk ${item.name}`}
                        title="Ubah produk"
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-surface-200 bg-white text-surface-600 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    {quickEditEnabled && item.lineType === "PRODUCT" && onEditPrice && (
                      <button
                        type="button"
                        onClick={() => onEditPrice(item)}
                        aria-label={`Ubah harga produk ${item.name}`}
                        title="Ubah harga produk"
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-surface-200 bg-white text-surface-600 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                      >
                        <DollarSign className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      onClick={() => onRemoveItem(item.cartLineId)}
                      className="p-0.5 text-surface-300 hover:text-danger-500 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
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
          <div className="flex gap-2">
            {onInternalStockOut && (
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={onInternalStockOut}
              >
                <PackageMinus size={18} />
                Stock Out
              </Button>
            )}
            <Button
              variant="accent"
              size="lg"
              className="flex-1"
              onClick={onCheckout}
            >
              {isQuotationMode ? <FileText size={18} /> : <CreditCard size={18} />}
              {isQuotationMode ? "Create Nota Penawaran" : "Bayar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

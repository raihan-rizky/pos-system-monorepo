"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@pos/ui";
import { CreditCard, DollarSign, FileText, PackageMinus, Pencil, ShoppingCart, X } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import type { CartItem, CartUnitOption, ProductCartItem } from "@/hooks/useCart";
import type { QuotationCheckoutMode } from "@/features/nota-penawaran/helpers/quotation-rules";
import { orderUnits } from "@/features/pos-product-variants/helpers/unit-order";
import { CartQuantityInput } from "@/features/pos-checkout/components/CartQuantityInput";
import { CartStockWarningDialog } from "@/features/pos-checkout/components/CartStockWarningDialog";
import styles from "./CartSidebar.module.css";
import { isSpecialCategoryPricing } from "@/features/customer-category-pricing/helpers/pricing-rules";
import { SpecialPriceBadge } from "@/features/customer-category-pricing/components/SpecialPriceBadge";
import { PriceRoundingBadge } from "@/features/product-price-rounding/components/PriceRoundingBadge";
import { roundSellingPrice, type PriceRoundingSettings } from "@/features/product-price-rounding/rounding";

interface CartSidebarProps {
  roundingSettings?: PriceRoundingSettings;
  specialPricingEnabled?: boolean;
  items: CartItem[];
  subtotal: number;
  totalItems: number;
  onUpdateQuantity: (cartLineId: string, quantity: number) => void;
  onChangeUnit?: (cartLineId: string, target: CartUnitOption) => void;
  onRemoveItem: (cartLineId: string) => void;
  onClearCart: () => void;
  onCheckout: () => void;
  checkoutMode?: QuotationCheckoutMode;
  onClose?: () => void;
  onInternalStockOut?: () => void;
  canQuickEdit?: boolean;
  onEditProduct?: (item: ProductCartItem) => void;
  onEditPrice?: (item: ProductCartItem) => void;
}

export function CartSidebar({
  items,
  subtotal,
  totalItems,
  onUpdateQuantity,
  onChangeUnit,
  onRemoveItem,
  onClearCart,
  onCheckout,
  checkoutMode = "payment",
  onClose,
  onInternalStockOut,
  canQuickEdit = false,
  onEditProduct,
  onEditPrice,
  roundingSettings,
  specialPricingEnabled = true,
}: CartSidebarProps) {
  const isQuotationMode = checkoutMode === "quotation";
  const [invalidQuantityLines, setInvalidQuantityLines] = useState<Set<string>>(
    new Set(),
  );
  const [unitErrors, setUnitErrors] = useState<Record<string, string>>({});
  const [pendingQuantityChange, setPendingQuantityChange] = useState<{
    cartLineId: string;
    quantity: number;
  } | null>(null);
  const pendingQuantityItem = items.find((item): item is ProductCartItem =>
    item.lineType === "PRODUCT" &&
    item.cartLineId === pendingQuantityChange?.cartLineId &&
    pendingQuantityChange.quantity > item.quantity &&
    pendingQuantityChange.quantity > item.stock,
  );
  const hasInvalidQuantity = items.some((item) =>
    invalidQuantityLines.has(item.cartLineId),
  );

  useEffect(() => {
    const activeLineIds = new Set(items.map((item) => item.cartLineId));
    setPendingQuantityChange((current) => current && items.some((item) =>
      item.lineType === "PRODUCT" && item.cartLineId === current.cartLineId &&
      current.quantity > item.quantity && current.quantity > item.stock,
    ) ? current : null);
    setInvalidQuantityLines((current) => {
      const next = new Set(
        [...current].filter((cartLineId) => activeLineIds.has(cartLineId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const updateQuantityValidity = (cartLineId: string, valid: boolean) => {
    setInvalidQuantityLines((current) => {
      const next = new Set(current);
      if (valid) next.delete(cartLineId);
      else next.add(cartLineId);
      return next;
    });
  };

  const requestQuantityChange = (item: CartItem, quantity: number) => {
    if (item.lineType === "PRODUCT" && quantity > item.quantity && quantity > item.stock) {
      setPendingQuantityChange({ cartLineId: item.cartLineId, quantity });
      return;
    }
    onUpdateQuantity(item.cartLineId, quantity);
  };

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
                className="relative p-3 rounded-xl bg-surface-50 animate-slide-up"
              >
                <div className="flex-1 min-w-0">
                  <p className="pr-10 text-sm font-semibold text-surface-900 truncate" title={item.name}>
                    {item.name}
                  </p>
                  {(item.size || item.material) && (
                    <p className="text-[10px] text-brand-600 mt-0.5 truncate">
                      {[item.size, item.material].filter(Boolean).join(" • ")}
                    </p>
                  )}
                  <p className="text-xs text-surface-500 mt-0.5">
                    {formatRupiah(item.price)} /{item.unit}
                  </p>
                  {item.lineType === "PRODUCT" && onChangeUnit && item.stockGroup?.id && (() => {
                    const options = orderUnits(
                      (item.unitOptions ?? [])
                        .filter((option) => option.stockGroup?.id === item.stockGroup?.id)
                        .map((option) => ({ ...option, id: option.productId })),
                      item.stockGroup?.baseUnit,
                    );
                    if (options.length < 2) return null;
                    return (
                      <div className="mt-2">
                        <select
                          aria-label={`Satuan ${item.name}`}
                          value={item.productId}
                          className="min-h-11 max-w-full rounded-md border border-surface-200 bg-white px-2 py-2 text-xs text-surface-700 outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30"
                          onChange={(event) => {
                            const target = options.find(
                              (option) => option.productId === event.target.value,
                            );
                            if (!target) return;
                            try {
                              onChangeUnit(item.cartLineId, target);
                              setUnitErrors((current) => {
                                const next = { ...current };
                                delete next[item.cartLineId];
                                return next;
                              });
                            } catch {
                              setUnitErrors((current) => ({
                                ...current,
                                [item.cartLineId]: "Satuan tidak dapat diganti. Silakan coba lagi.",
                              }));
                            }
                          }}
                        >
                          {options.map((option) => (
                            <option key={option.productId} value={option.productId}>
                              {option.unit} • {formatRupiah(option.price)}{isSpecialCategoryPricing(option.appliedPricing) ? " • Harga Khusus" : ""}
                            </option>
                          ))}
                        </select>
                        {unitErrors[item.cartLineId] && (
                          <p role="alert" className="mt-1 text-[10px] text-danger-600">
                            {unitErrors[item.cartLineId]}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  {item.lineType === "PRODUCT" && item.transactionPrice != null && (
                    <div className="mt-1 text-[10px] font-medium text-brand-700">
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 font-bold">
                        Harga khusus
                      </span>
                      <span className="ml-1">Hanya berlaku untuk transaksi ini</span>
                    </div>
                  )}
                  {item.lineType === "PRODUCT" && <PriceRoundingBadge rounding={item.priceRounding} />}
                  {item.lineType === "PRODUCT" && (
                    <dl className={`mt-2 grid ${specialPricingEnabled ? "grid-cols-3" : "grid-cols-1"} gap-2 text-[11px] text-surface-600`}>
                      <div>
                        <dt className="font-semibold">Normal</dt>
                        <dd>{formatRupiah(roundSellingPrice(item.catalogPrice, roundingSettings).roundedPrice)}</dd>
                      </div>
                      {specialPricingEnabled && <div>
                        <dt className="font-semibold">Agen</dt>
                        <dd className={item.hargaAgen != null && item.hargaAgen > 0 ? "text-emerald-800" : undefined}>
                          {item.hargaAgen != null && item.hargaAgen > 0
                            ? formatRupiah(roundSellingPrice(item.hargaAgen, roundingSettings).roundedPrice)
                            : formatRupiah(roundSellingPrice(item.catalogPrice, roundingSettings).roundedPrice)}
                          {item.hargaAgen != null && item.hargaAgen > 0 ? <SpecialPriceBadge className="ml-1 align-middle" /> : <span className="block text-[10px] text-surface-500">Mengikuti harga jual</span>}
                        </dd>
                      </div>}
                      {specialPricingEnabled && <div>
                        <dt className="font-semibold">Dinas</dt>
                        <dd className={item.hargaDinas != null && item.hargaDinas > 0 ? "text-emerald-800" : undefined}>
                          {item.hargaDinas != null && item.hargaDinas > 0
                            ? formatRupiah(roundSellingPrice(item.hargaDinas, roundingSettings).roundedPrice)
                            : formatRupiah(roundSellingPrice(item.catalogPrice, roundingSettings).roundedPrice)}
                          {item.hargaDinas != null && item.hargaDinas > 0 ? <SpecialPriceBadge className="ml-1 align-middle" /> : <span className="block text-[10px] text-surface-500">Mengikuti harga jual</span>}
                        </dd>
                      </div>}
                    </dl>
                  )}
                  {item.lineType === "PRODUCT" && !specialPricingEnabled && (
                    <p className="mt-1 text-[10px] text-surface-500">Harga Khusus nonaktif; transaksi memakai harga normal.</p>
                  )}
                  <p className={`text-sm font-bold mt-1 ${item.lineType === "PRODUCT" && item.transactionPrice == null && isSpecialCategoryPricing(item.appliedPricing) ? "text-emerald-800" : "text-brand-600"}`}>
                    {formatRupiah(item.price * item.quantity)}
                  </p>
                  {item.lineType === "PRODUCT" && item.transactionPrice == null && isSpecialCategoryPricing(item.appliedPricing) && <SpecialPriceBadge />}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.cartLineId)}
                  aria-label={`Hapus ${item.name} dari keranjang`}
                  className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 transition-colors hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${styles.touchTarget}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-surface-200/70 pt-1">
                  <div className="flex items-center gap-1">
                    {canQuickEdit && item.lineType === "PRODUCT" && onEditProduct && (
                      <button
                        type="button"
                        onClick={() => onEditProduct(item)}
                        aria-label={`Ubah produk ${item.name}`}
                        title="Ubah produk"
                        className={`flex h-8 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-surface-600 transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${styles.touchTarget}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                      </button>
                    )}
                    {canQuickEdit && item.lineType === "PRODUCT" && onEditPrice && (
                      <button
                        type="button"
                        onClick={() => onEditPrice(item)}
                        aria-label={`Ubah harga produk ${item.name}`}
                        title="Ubah harga produk"
                        className={`flex h-8 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-surface-600 transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${styles.touchTarget}`}
                      >
                        <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                        Harga
                      </button>
                    )}
                  </div>
                  <div className="ml-auto flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => requestQuantityChange(item, item.quantity - 1)}
                      disabled={Boolean(pendingQuantityItem)}
                      aria-label={`Kurangi jumlah ${item.name}`}
                      className={`h-7 w-7 flex items-center justify-center rounded-lg bg-white border border-surface-200 text-surface-600 hover:bg-surface-100 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${styles.touchTarget}`}
                    >
                      −
                    </button>
                    <CartQuantityInput
                      name={item.name}
                      quantity={item.quantity}
                      onChange={(quantity) =>
                        requestQuantityChange(item, quantity)
                      }
                      onValidityChange={(valid) =>
                        updateQuantityValidity(item.cartLineId, valid)
                      }
                    />
                    <button
                      type="button"
                      onClick={() => requestQuantityChange(item, item.quantity + 1)}
                      disabled={Boolean(pendingQuantityItem)}
                      aria-label={`Tambah jumlah ${item.name}`}
                      className={`h-7 w-7 flex items-center justify-center rounded-lg bg-white border border-surface-200 text-surface-600 hover:bg-surface-100 text-sm font-bold transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${styles.touchTarget}`}
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
              disabled={hasInvalidQuantity || Boolean(pendingQuantityItem)}
            >
              {isQuotationMode ? <FileText size={18} /> : <CreditCard size={18} />}
              {isQuotationMode ? "Create Nota Penawaran" : "Bayar"}
            </Button>
          </div>
        </div>
      )}
      {pendingQuantityItem && pendingQuantityChange && (
        <CartStockWarningDialog
          item={pendingQuantityItem}
          quantity={pendingQuantityChange.quantity}
          onCancel={() => setPendingQuantityChange(null)}
          onConfirm={() => {
            onUpdateQuantity(pendingQuantityItem.cartLineId, pendingQuantityChange.quantity);
            setPendingQuantityChange(null);
          }}
        />
      )}
    </div>
  );
}

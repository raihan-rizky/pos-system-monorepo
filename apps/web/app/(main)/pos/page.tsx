"use client";

import React, { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { ProductGrid } from "@/components/ProductGrid";
import { CartSidebar } from "@/components/CartSidebar";
import { ShiftStatusBanner } from "@/components/ShiftStatusBanner";
import { Input } from "@pos/ui";


const PaymentModal = dynamic(
  () => import("@/components/PaymentModal").then((mod) => mod.PaymentModal),
  { ssr: false },
);
const ReceiptModal = dynamic(
  () => import("@/components/ReceiptModal").then((mod) => mod.ReceiptModal),
  { ssr: false },
);
const OpenShiftModal = dynamic(
  () => import("@/components/OpenShiftModal").then((mod) => mod.OpenShiftModal),
  { ssr: false },
);
const CloseShiftModal = dynamic(
  () =>
    import("@/components/CloseShiftModal").then((mod) => mod.CloseShiftModal),
  { ssr: false },
);
import { formatRupiah } from "@/lib/utils";
import {
  useProducts,
  useCategories,
} from "@/hooks/useProducts";
import { useCart } from "@/hooks/useCart";
import { useCreateTransaction, type Transaction } from "@/hooks/useTransactions";
import { useActiveShift } from "@/hooks/useShift";
import { useRole } from "@/components/providers/RoleProvider";

export default function POSPage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [showPayment, setShowPayment] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [shiftModalDismissed, setShiftModalDismissed] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState<{
    tone: "success" | "warning" | "danger";
    message: string;
  } | null>(null);
  const [todayLabel, setTodayLabel] = useState("");

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  useEffect(() => {
    setTodayLabel(
      new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Asia/Jakarta",
      }).format(new Date()),
    );
  }, []);

  const { data: activeShift, isLoading: shiftLoading } = useActiveShift();
  const { role } = useRole();
  const isSales = role === "SALES";

  const { data: products = [], isLoading: productsLoading } = useProducts(
    search,
    selectedCategory,
  );
  const { data: categories = [] } = useCategories();
  const cart = useCart();
  const createTransaction = useCreateTransaction();


  const handleOpenPayment = () => {
    if (!activeShift) {
      setCheckoutNotice({
        tone: "warning",
        message:
          "Buka shift kasir terlebih dahulu sebelum melakukan transaksi pembayaran.",
      });
      setShiftModalDismissed(false);
      return;
    }
    setCheckoutNotice(null);
    setShowPayment(true);
  };

  const handleCheckout = async (data: {
    paymentMethod: string;
    amountPaid: number;
    discount: number;
    note: string;
    customerName: string;
    customerId: string | null;
    salesName: string;
    salespersonId: string;
    paymentStatus: string;
    isJobOrder: boolean;
    estimatedDoneAt: string | null;
  }) => {
    try {
      const payload = {
        items: cart.items,
        paymentMethod: data.paymentMethod,
        amountPaid: data.amountPaid,
        discount: data.discount,
        note: data.note,
        customerName: data.customerName,
        customerId: data.customerId,
        salesName: data.salesName,
        salespersonId: data.salespersonId,
        paymentStatus: data.paymentStatus,
        isJobOrder: data.isJobOrder,
        estimatedDoneAt: data.estimatedDoneAt,
      };
      const result = await createTransaction.mutateAsync(payload);
      if (result.status !== "PENDING_APPROVAL") {
        setLastTransaction(result);
      } else {
        setCheckoutNotice({
          tone: "success",
          message:
            "Permintaan pembayaran berhasil dikirim ke kasir. Tunggu persetujuan sebelum menyerahkan barang.",
        });
      }
      cart.clearCart();
      setShowPayment(false);
    } catch (error) {
      console.error("Transaction failed:", error);
      if (
        typeof window !== "undefined" &&
        (!navigator.onLine || error instanceof TypeError)
      ) {
        try {
          const { createOfflineTransaction } = await import(
            "@/lib/offline/offline-db"
          );
          await createOfflineTransaction({
            items: cart.items,
            paymentMethod: data.paymentMethod as "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER",
            amountPaid: data.amountPaid,
            discount: data.discount,
            note: data.note,
            customerName: data.customerName,
            customerId: data.customerId,
            salesName: data.salesName,
            salespersonId: data.salespersonId,
            paymentStatus: data.paymentStatus,
            isJobOrder: data.isJobOrder,
            estimatedDoneAt: data.estimatedDoneAt,
            originalSubtotal: cart.subtotal,
            originalTotal: Math.max(0, cart.subtotal - data.discount),
          });
          cart.clearCart();
          setShowPayment(false);
          setCheckoutNotice({
            tone: "warning",
            message:
              "Transaksi tersimpan offline dan akan disinkronkan saat online.",
          });
        } catch (queueError) {
          setCheckoutNotice({
            tone: "danger",
            message:
              queueError instanceof Error
                ? queueError.message
                : "Gagal menyimpan transaksi offline.",
          });
        }
      } else {
        setCheckoutNotice({
          tone: "danger",
          message:
            error instanceof Error
              ? error.message
              : "Transaksi gagal diproses. Periksa data pembayaran lalu coba lagi.",
        });
      }
    }
  };

  return (
    <>
      {!shiftLoading && activeShift && (
        <ShiftStatusBanner
          shift={activeShift}
          onCloseShift={() => setShowCloseShift(true)}
          canCloseShift={!isSales && !activeShift.isLocalOnly}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Products Area */}
        <div className="flex-1 flex flex-col overflow-auto w-[100px]">
          {/* Top Bar */}
          <header className="flex items-center gap-2 md:gap-4 px-3 md:px-6 py-3 md:py-4 bg-white border-b border-surface-100">
            <div className="flex-1">
              <Input
                placeholder="Cari produk, SKU, atau barcode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                }
              />
            </div>
            <div className="flex items-center gap-2">
              {todayLabel && (
                <div className="hidden md:block text-right">
                  <p className="text-xs text-surface-400">
                    {todayLabel}
                  </p>
                </div>
              )}
            </div>
          </header>

          {checkoutNotice && (
            <div
              role="status"
              className={`mx-3 mt-3 rounded-xl border px-4 py-3 text-sm font-medium md:mx-6 ${
                checkoutNotice.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : checkoutNotice.tone === "danger"
                    ? "border-danger-200 bg-danger-50 text-danger-700"
                    : "border-warning-200 bg-warning-50 text-warning-900"
              }`}
            >
              {checkoutNotice.message}
            </div>
          )}

          {/* Category Filter */}
          <div
            className="flex items-center gap-2 px-3 md:px-6 py-2 md:py-3 overflow-x-auto bg-white border-b border-surface-100 flex-nowrap scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <button
              onClick={() => setSelectedCategory("")}
              className={`
                px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0
                transition-all duration-200
                ${
                  selectedCategory === ""
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-surface-100 text-surface-600 hover:bg-surface-200"
                }
              `}
            >
              Semua
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() =>
                  setSelectedCategory(selectedCategory === cat.id ? "" : cat.id)
                }
                className={`
                  px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0
                  transition-all duration-200 flex items-center gap-1.5
                  ${
                    selectedCategory === cat.id
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-surface-100 text-surface-600 hover:bg-surface-200"
                  }
                `}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
                <span className="text-xs opacity-70">
                  ({cat._count.products})
                </span>
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto px-3 md:px-6 py-3 md:py-4">
            <ProductGrid
              products={products}
              onAddToCart={(product) =>
                cart.addItem({
                  id: product.id,
                  name: product.name,
                  price: Number(product.price),
                  unit: product.unit,
                  stock: product.stock,
                  size: product.size || undefined,
                  material: product.material || undefined,
                })
              }
              isLoading={productsLoading}
            />
          </div>
        </div>

        {/* Cart Sidebar - Desktop (lg+) */}
        <div className="hidden lg:block w-[340px] flex-shrink-0">
          <CartSidebar
            items={cart.items}
            subtotal={cart.subtotal}
            totalItems={cart.totalItems}
            onUpdateQuantity={cart.updateQuantity}
            onRemoveItem={cart.removeItem}
            onClearCart={cart.clearCart}
            onCheckout={handleOpenPayment}
          />
        </div>
      </div>

      {/* Mobile Cart FAB - visible on <lg when cart has items */}
      {!showPayment && cart.totalItems > 0 && (
        <button
          onClick={openCart}
          className="lg:hidden fixed bottom-20 md:bottom-4 right-4 z-[90] flex items-center gap-2.5 px-5 py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl shadow-lg shadow-brand-600/30 transition-all duration-200 active:scale-95 animate-scale-in"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
          </svg>
          <span className="font-bold text-sm">
            Keranjang ({cart.totalItems})
          </span>
          <span className="text-xs opacity-80">•</span>
          <span className="font-extrabold text-sm">
            {formatRupiah(cart.subtotal)}
          </span>
        </button>
      )}

      {/* Mobile Cart Modal - slide-up overlay */}
      {isCartOpen && (
        <div className="lg:hidden fixed inset-0 z-[200] flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 animate-fade-in"
            onClick={closeCart}
          />
          {/* Cart panel */}
          <div className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col animate-slide-up-full shadow-2xl">
            <CartSidebar
              items={cart.items}
              subtotal={cart.subtotal}
              totalItems={cart.totalItems}
              onUpdateQuantity={cart.updateQuantity}
              onRemoveItem={cart.removeItem}
              onClearCart={cart.clearCart}
              onCheckout={() => {
                closeCart();
                handleOpenPayment();
              }}
              onClose={closeCart}
            />
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          open={showPayment}
          onClose={() => setShowPayment(false)}
          items={cart.items}
          subtotal={cart.subtotal}
          onConfirm={handleCheckout}
          isProcessing={createTransaction.isPending}
        />
      )}

      {/* Receipt Modal */}
      {lastTransaction && (
        <ReceiptModal
          open={!!lastTransaction}
          onClose={() => setLastTransaction(null)}
          transaction={lastTransaction}
        />
      )}

      {/* Shift Modals */}
      {!shiftLoading && !activeShift && !shiftModalDismissed && !isSales && (
        <OpenShiftModal
          open={true}
          onClose={() => setShiftModalDismissed(true)}
        />
      )}
      {!shiftLoading && !activeShift && isSales && !shiftModalDismissed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm mx-4 text-center shadow-xl">
            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Belum Ada Shift Aktif</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Kasir belum membuka shift. Hubungi kasir untuk membuka shift terlebih dahulu agar Anda bisa melakukan transaksi.
            </p>
            <button
              onClick={() => setShiftModalDismissed(true)}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
      {showCloseShift && (
        <CloseShiftModal
          open={showCloseShift}
          onClose={() => setShowCloseShift(false)}
          shift={activeShift || null}
        />
      )}
    </>
  );
}

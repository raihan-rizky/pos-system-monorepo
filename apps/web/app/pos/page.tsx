"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ProductGrid } from "@/components/ProductGrid";
import { CartSidebar } from "@/components/CartSidebar";
import { PaymentModal } from "@/components/PaymentModal";
import { ReceiptModal } from "@/components/ReceiptModal";
import { AddProductModal } from "@/components/AddProductModal";
import { EditProductModal } from "@/components/EditProductModal";
import { OpenShiftModal } from "@/components/OpenShiftModal";
import { CloseShiftModal } from "@/components/CloseShiftModal";
import { ShiftStatusBanner } from "@/components/ShiftStatusBanner";
import { Input, Button } from "@pos/ui";
import { formatRupiah } from "@/lib/utils";
import { useProducts, useCategories, useDeleteProduct, Product } from "@/hooks/useProducts";
import { useCart } from "@/hooks/useCart";
import { useCreateTransaction } from "@/hooks/useTransactions";
import { useActiveShift } from "@/hooks/useShift";

export default function POSPage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [showPayment, setShowPayment] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [shiftModalDismissed, setShiftModalDismissed] = useState(false);

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  const { data: activeShift, isLoading: shiftLoading } = useActiveShift();

  const { data: products = [], isLoading: productsLoading } = useProducts(
    search,
    selectedCategory
  );
  const { data: categories = [] } = useCategories();
  const deleteProduct = useDeleteProduct();
  const cart = useCart();
  const createTransaction = useCreateTransaction();

  const filteredProducts = useMemo(() => {
    return products;
  }, [products]);

  const handleOpenPayment = () => {
    if (!activeShift) {
      alert("Anda harus membuka shift kasir terlebih dahulu sebelum bisa melakukan transaksi pembayaran.");
      setShiftModalDismissed(false);
      return;
    }
    setShowPayment(true);
  };

  const handleCheckout = async (data: {
    paymentMethod: string;
    amountPaid: number;
    discount: number;
    note: string;
    customerName: string;
    salesName: string;
    paymentStatus: string;
  }) => {
    try {
      const result = await createTransaction.mutateAsync({
        items: cart.items,
        paymentMethod: data.paymentMethod,
        amountPaid: data.amountPaid,
        discount: data.discount,
        note: data.note,
        customerName: data.customerName,
        salesName: data.salesName,
        paymentStatus: data.paymentStatus,
      });
      setLastTransaction(result);
      cart.clearCart();
      setShowPayment(false);
    } catch (error) {
      console.error("Transaction failed:", error);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (confirm(`Apakah Anda yakin ingin menghapus "${product.name}"?`)) {
      try {
        await deleteProduct.mutateAsync(product.id);
      } catch (error) {
        alert("Gagal menghapus barang.");
      }
    }
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-surface-50">
      <Sidebar />

      {/* Main Content */}
      <div className="flex flex-1 flex-col ml-0 md:ml-[72px] pb-16 md:pb-0">
        {!shiftLoading && activeShift && (
          <ShiftStatusBanner shift={activeShift} onCloseShift={() => setShowCloseShift(true)} />
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={isEditMode ? "secondary" : "ghost"}
                onClick={() => setIsEditMode(!isEditMode)}
                className={`flex items-center gap-2 ${isEditMode ? "bg-surface-200 text-surface-900 border border-surface-300" : "text-surface-600 hover:bg-surface-100"}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span className="hidden md:inline">{isEditMode ? "Selesai Atur" : "Atur Barang"}</span>
              </Button>
              <Button
                variant="primary"
                onClick={() => setShowAddProduct(true)}
                className="flex items-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span className="hidden md:inline">Tambah Barang</span>
              </Button>
              <div className="hidden md:block text-right border-l border-surface-200 pl-4">
                <p className="text-xs text-surface-400">
                  {new Date().toLocaleDateString("id-ID", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </header>

          {/* Category Filter */}
          <div className="flex items-center gap-2 px-3 md:px-6 py-2 md:py-3 overflow-x-auto bg-white border-b border-surface-100 flex-nowrap scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <button
              onClick={() => setSelectedCategory("")}
              className={`
                px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0
                transition-all duration-200
                ${selectedCategory === ""
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
                  ${selectedCategory === cat.id
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-surface-100 text-surface-600 hover:bg-surface-200"
                  }
                `}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
                <span className="text-xs opacity-70">({cat._count.products})</span>
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto px-3 md:px-6 py-3 md:py-4">
            <ProductGrid
              products={filteredProducts}
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
              isEditMode={isEditMode}
              onEditProduct={setProductToEdit}
              onDeleteProduct={handleDeleteProduct}
            />
          </div>
        </div>

        {/* Cart Sidebar - Desktop (lg+) */}
        {!isEditMode && (
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
        )}
        </div>
      </div>

      {/* Mobile Cart FAB - visible on <lg when cart has items */}
      {!isEditMode && !showPayment && cart.totalItems > 0 && (
        <button
          onClick={openCart}
          className="lg:hidden fixed bottom-20 md:bottom-4 right-4 z-[90] flex items-center gap-2.5 px-5 py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl shadow-lg shadow-brand-600/30 transition-all duration-200 active:scale-95 animate-scale-in"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
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
      <PaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        items={cart.items}
        subtotal={cart.subtotal}
        onConfirm={handleCheckout}
        isProcessing={createTransaction.isPending}
      />

      {/* Receipt Modal */}
      {lastTransaction && (
        <ReceiptModal
          open={!!lastTransaction}
          onClose={() => setLastTransaction(null)}
          transaction={lastTransaction}
        />
      )}

      {/* Add Product Modal */}
      <AddProductModal
        open={showAddProduct}
        onClose={() => setShowAddProduct(false)}
      />

      {/* Edit Product Modal */}
      <EditProductModal
        open={!!productToEdit}
        onClose={() => setProductToEdit(null)}
        product={productToEdit}
      />

      {/* Shift Modals */}
      <OpenShiftModal 
        open={!shiftLoading && !activeShift && !shiftModalDismissed} 
        onClose={() => setShiftModalDismissed(true)} 
      />
      <CloseShiftModal 
        open={showCloseShift} 
        onClose={() => setShowCloseShift(false)} 
        shift={activeShift || null} 
      />
    </div>
  );
}

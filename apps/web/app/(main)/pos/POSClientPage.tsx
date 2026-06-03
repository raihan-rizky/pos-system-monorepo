"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle } from "lucide-react";
import { ProductGrid } from "@/components/ProductGrid";
import { CartSidebar } from "@/components/CartSidebar";
import { ShiftStatusBanner } from "@/components/ShiftStatusBanner";
import { Pagination } from "@/components/Pagination";
import { Button, Input, Modal } from "@pos/ui";

import { getLogger } from "@/lib/logger";

const log = getLogger("page:main:pos");
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
const PrintingServicesTab = dynamic(
  () =>
    import("@/features/printing-services/components/PrintingServicesTab").then(
      (mod) => mod.PrintingServicesTab,
    ),
  { ssr: false },
);
const NotaPenawaranModal = dynamic(
  () =>
    import("@/features/nota-penawaran/components/NotaPenawaranModal").then(
      (mod) => mod.NotaPenawaranModal,
    ),
  { ssr: false },
);
import { formatRupiah } from "@/lib/utils";
import {
  useProductsPage,
  useCategories,
  type Category,
  type Product,
  type ProductsResponse,
} from "@/hooks/useProducts";
import { useCart, type ProductCartItem } from "@/hooks/useCart";
import { useCreateTransaction, type Transaction } from "@/hooks/useTransactions";
import { useCreateDraft } from "@/features/transactions-draft";
import { HorizontalScroll } from "@/components/ui/HorizontalScroll";
import { useActiveShift, type CashierShift } from "@/hooks/useShift";
import { useRole } from "@/components/providers/RoleProvider";
import { parseSearchQuery } from "@/features/pos-search/pos-search";
import type { PrintingServiceOrderData } from "@/features/printing-services/components/PrintingServiceOrderModal";
import {
  loadStockOnlyPreference,
  matchesStockFilter,
  saveStockOnlyPreference,
} from "@/features/pos-search/pos-stock-filter";
import { getInitialHideOutOfStock } from "@/features/pos-search/pos-stock-filter-hydration";
import {
  getCartCheckoutMode,
} from "@/features/nota-penawaran/helpers/quotation-rules";
import type { DraftCreateInput } from "@/features/transactions-draft";

const POS_PAGE_SIZE = 24;

export type POSInitialData = {
  products: ProductsResponse | null;
  categories: Category[];
  activeShift?: CashierShift | null;
};

export default function POSClientPage({
  initialData,
}: {
  initialData: POSInitialData;
}) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [page, setPage] = useState(1);
  const [hideOutOfStock, setHideOutOfStock] = useState<boolean>(
    getInitialHideOutOfStock,
  );
  const [showPayment, setShowPayment] = useState(false);
  const [showNotaPenawaran, setShowNotaPenawaran] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(null);
  const [draftPrintDivision, setDraftPrintDivision] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [activeTab, setActiveTab] = useState<"products" | "services">("products");
  const [pendingEmptyStockProduct, setPendingEmptyStockProduct] =
    useState<Product | null>(null);
  const [shiftModalDismissed, setShiftModalDismissed] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState<{
    tone: "success" | "warning" | "danger";
    message: string;
  } | null>(null);
  const [todayLabel, setTodayLabel] = useState("");

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  const toggleHideOutOfStock = useCallback(() => {
    setHideOutOfStock((prev) => {
      const next = !prev;
      saveStockOnlyPreference(next);
      return next;
    });
    setPage(1);
  }, []);

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

  useEffect(() => {
    const persisted = loadStockOnlyPreference();
    if (persisted) setHideOutOfStock(true);
  }, []);

  const { data: activeShift, isLoading: shiftLoading } = useActiveShift(
    initialData.activeShift ?? undefined,
  );
  const { role } = useRole();
  const isSales = role === "SALES";

  const productsQuery = useProductsPage(search, selectedCategory, {
    page,
    limit: POS_PAGE_SIZE,
    inStockOnly: hideOutOfStock,
    initialData: initialData.products ?? undefined,
  });
  const visibleProducts = useMemo(
    () =>
      (productsQuery.data?.data ?? []).filter((p) =>
        matchesStockFilter({ stock: p.stock }, hideOutOfStock),
      ),
    [productsQuery.data?.data, hideOutOfStock],
  );
  const productsLoading = productsQuery.isLoading;
  const isPageFetching = productsQuery.isFetching;
  const pagination = productsQuery.data?.pagination;
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  const currentPage = Math.min(
    Math.max(1, pagination?.page ?? page),
    totalPages,
  );
  const searchTokens = parseSearchQuery(search);

  const { data: categories = [] } = useCategories(initialData.categories);
  const cart = useCart();
  const checkoutMode = useMemo(
    () => getCartCheckoutMode(cart.items),
    [cart.items],
  );
  const productCartItems = useMemo(
    () =>
      cart.items.filter(
        (item): item is ProductCartItem => item.lineType === "PRODUCT",
      ),
    [cart.items],
  );

  const addProductToCart = useCallback((product: Product) => {
    cart.addItem({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      costPrice: product.costPrice,
      unit: product.unit,
      stock: product.stock,
      categoryId: product.category.id,
      categoryName: product.category.name,
    });
  }, [cart]);

  const handleProductClick = useCallback((product: Product) => {
    if (
      product.stock <= 0 &&
      (role === "CASHIER" || role === "SALES")
    ) {
      setPendingEmptyStockProduct(product);
      return;
    }
    addProductToCart(product);
  }, [addProductToCart, role]);

  const handleAddPrintingService = useCallback(
    (data: PrintingServiceOrderData) => {
      cart.addServiceItem({
        printingServiceId: data.service.id,
        name: data.service.name,
        price: data.price,
        quantity: data.quantity,
        unit: data.service.unit,
        size: data.size,
        material: data.materialName,
        serviceNote: data.serviceNote,
        needsMaterial: data.needsMaterial,
        rawMaterialProductId: data.rawMaterialProductId ?? null,
        rawMaterialQuantity: data.rawMaterialQuantity ?? null,
        rawMaterialUnit: data.rawMaterialUnit ?? null,
      });
    },
    [cart],
  );

  useEffect(() => {
    setPage(1);
  }, [search, selectedCategory]);

  useEffect(() => {
    if (
      pagination &&
      pagination.totalPages > 0 &&
      page > pagination.totalPages
    ) {
      setPage(pagination.totalPages);
    }
  }, [pagination, page]);

  const createTransaction = useCreateTransaction();
  const createDraft = useCreateDraft();
  const [draftError, setDraftError] = useState<string | null>(null);

  const hasItems = cart.totalItems > 0;
  const hasServiceItems = cart.items.some(
    (item) => item.lineType === "PRINTING_SERVICE",
  );
  useEffect(() => {
    if (hasItems) {
      import("@/components/PaymentModal");
      import("@/components/ReceiptModal");
      if (checkoutMode === "quotation") {
        import("@/features/nota-penawaran/components/NotaPenawaranModal");
      }
    }
  }, [checkoutMode, hasItems]);

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

  const handleOpenNotaPenawaran = () => {
    if (hasServiceItems) {
      setCheckoutNotice({
        tone: "danger",
        message:
          "Nota penawaran stok kosong saat ini hanya mendukung produk, belum layanan cetak.",
      });
      return;
    }
    setCheckoutNotice(null);
    setShowNotaPenawaran(true);
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
    items: typeof cart.items;
  }) => {
    try {
      const { items: pricedItems, ...transactionData } = data;
      const result = await createTransaction.mutateAsync({
        items: pricedItems,
        ...transactionData,
      });
      setLastTransaction(result);
      if (result.status === "PENDING_APPROVAL") {
        setCheckoutNotice({
          tone: "success",
          message:
            "Permintaan pembayaran berhasil dikirim ke kasir. Tunggu persetujuan sebelum menyerahkan barang.",
        });
      }
      cart.clearCart();
      setShowPayment(false);
    } catch (error) {
      log.error("Transaction failed:", error);
      if (
        typeof window !== "undefined" &&
        (!navigator.onLine || error instanceof TypeError)
      ) {
        if (hasServiceItems) {
          setCheckoutNotice({
            tone: "danger",
            message:
              "Transaksi layanan cetak membutuhkan koneksi agar pemakaian bahan bisa dicatat ke stok.",
          });
          return;
        }
        const offlinePricedItems = data.items.filter(
          (item): item is ProductCartItem => item.lineType === "PRODUCT",
        );
        try {
          const { createOfflineTransaction } = await import(
            "@/lib/offline/offline-db"
          );
          await createOfflineTransaction({
            items: offlinePricedItems,
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
            originalSubtotal: offlinePricedItems.reduce(
              (sum, item) => sum + item.price * item.quantity,
              0,
            ),
            originalTotal: Math.max(
              0,
              offlinePricedItems.reduce(
                (sum, item) => sum + item.price * item.quantity,
                0,
              ) - data.discount,
            ),
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

  const handleSaveDraft = async (data: {
    discount: number;
    note: string;
    customerName: string;
    customerId: string | null;
    salesName: string;
    salespersonId: string;
    isJobOrder: boolean;
    estimatedDoneAt: string | null;
    items: typeof cart.items;
  }) => {
    setDraftError(null);
    try {
      const draft = await createDraft.mutateAsync({
        items: data.items
          .filter((item): item is ProductCartItem => item.lineType === "PRODUCT")
          .map((item) => ({
            productId: item.productId,
            name: item.name,
            size: item.size ?? null,
            material: item.material ?? null,
            price: item.price,
            quantity: item.quantity,
          })),
        discount: data.discount,
        note: data.note,
        customerName: data.customerName,
        customerId: data.customerId,
        salesName: data.salesName,
        salespersonId: data.salespersonId,
        isJobOrder: data.isJobOrder,
        estimatedDoneAt: data.estimatedDoneAt,
      });
      cart.clearCart();
      setShowPayment(false);
      setLastTransaction(draft);
      setCheckoutNotice({
        tone: "success",
        message: `Faktur sementara ${draft.draftNumber ?? ""} berhasil disimpan. Setujui di Riwayat Transaksi untuk memproses stok.`,
      });
    } catch (error) {
      log.error("Draft creation failed:", error);
      setDraftError(
        error instanceof Error
          ? error.message
          : "Gagal menyimpan faktur sementara",
      );
    }
  };

  const handleCreateNotaPenawaran = async (
    input: DraftCreateInput,
    printDivision: string,
  ) => {
    setDraftError(null);
    try {
      const draft = await createDraft.mutateAsync(input);
      cart.clearCart();
      setShowNotaPenawaran(false);
      setDraftPrintDivision(printDivision);
      setLastTransaction(draft);
      setCheckoutNotice({
        tone: "success",
        message: `Nota penawaran ${draft.draftNumber ?? ""} berhasil dibuat.`,
      });
    } catch (error) {
      log.error("Nota penawaran creation failed:", error);
      setDraftError(
        error instanceof Error
          ? error.message
          : "Gagal membuat nota penawaran",
      );
    }
  };

  const handleConfirmEmptyStockProduct = () => {
    if (!pendingEmptyStockProduct) return;
    addProductToCart(pendingEmptyStockProduct);
    setPendingEmptyStockProduct(null);
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
        {/* ✅ FIX: Hapus w-[100px], ganti overflow-auto → overflow-hidden, tambah min-w-0 */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Top Bar */}
          <header className="flex items-center gap-2 md:gap-4 px-3 md:px-6 py-3 md:py-4 bg-white border-b border-surface-100">
            <div className="flex rounded-xl border border-surface-200 bg-surface-50 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("products")}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "products"
                  ? "bg-white text-brand-700 shadow-sm"
                  : "text-surface-600 hover:text-surface-900"
                  }`}
              >
                Produk
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("services")}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "services"
                  ? "bg-white text-brand-700 shadow-sm"
                  : "text-surface-600 hover:text-surface-900"
                  }`}
              >
                Layanan
              </button>
            </div>
            <div className="flex-1 min-w-0">
              {activeTab === "products" ? (
                <div className="relative">
                  <Input
                    placeholder="Cari produk, SKU, atau barcode..."
                    aria-label="Cari produk, SKU, atau barcode"
                    hint={
                      searchTokens.length > 1
                        ? `Mencocokkan semua kata: ${searchTokens.join(" + ")}`
                        : undefined
                    }
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
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      aria-label="Hapus pencarian"
                      className="absolute right-3 top-[18px] -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              ) : (
                <div className="hidden text-sm font-medium text-surface-500 md:block">
                  Kelola dan tambahkan layanan sesuai kebutuhan
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {todayLabel && (
                <div className="hidden md:block text-right">
                  <p className="text-xs text-surface-400">{todayLabel}</p>
                </div>
              )}
            </div>
          </header>

          {checkoutNotice && (
            <div
              role="status"
              className={`mx-3 mt-3 rounded-xl border px-4 py-3 text-sm font-medium md:mx-6 ${checkoutNotice.tone === "success"
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
          {activeTab === "products" && (
            <HorizontalScroll
              className="px-3 md:px-6 py-2 md:py-3 bg-white border-b border-surface-100 flex items-center gap-2 flex-nowrap"
              showScrollIndicators={true}
            >
              <button
                type="button"
                onClick={toggleHideOutOfStock}
                role="switch"
                aria-checked={hideOutOfStock}
                aria-label="Sembunyikan produk stok habis"
                title={
                  hideOutOfStock
                    ? "Menampilkan produk tersedia saja"
                    : "Tampilkan semua, termasuk stok habis"
                }
                className={`
                px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0
                flex items-center gap-1.5
                transition-colors duration-150 will-change-transform active:scale-[0.97]
                ${hideOutOfStock
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-surface-100 text-surface-600 hover:bg-surface-200"
                  }
              `}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {hideOutOfStock ? (
                    <polyline points="20 6 9 17 4 12" />
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 12h8" />
                    </>
                  )}
                </svg>
                <span>Stok tersedia</span>
              </button>
              <span
                aria-hidden="true"
                className="h-5 w-px bg-surface-200 mx-1 flex-shrink-0"
              />
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
                  <span className="text-xs opacity-70">
                    ({cat._count.products})
                  </span>
                </button>
              ))}
            </HorizontalScroll>
          )}

          {/* Product Grid */}
          {activeTab === "products" ? (
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 md:px-6 py-3 md:py-4">
              <ProductGrid
                products={visibleProducts}
                onAddToCart={handleProductClick}
                isLoading={productsLoading}
              />
            </div>
          ) : (
            <PrintingServicesTab onAddToCart={handleAddPrintingService} />
          )}

          {/* Pagination */}
          {activeTab === "products" && pagination && pagination.total > 0 && (
            /* shrink-0 keeps pagination pinned at the bottom */
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              total={pagination.total}
              pageSize={pagination.limit}
              isFetching={isPageFetching}
              onPageChange={(next) => setPage(next)}
            />
          )}
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
            onCheckout={
              checkoutMode === "quotation"
                ? handleOpenNotaPenawaran
                : handleOpenPayment
            }
            checkoutMode={checkoutMode}
          />
        </div>
      </div>

      {/* Mobile Cart FAB */}
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

      {/* Mobile Cart Modal */}
      {isCartOpen && (
        <div className="lg:hidden fixed inset-0 z-[200] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/50 animate-fade-in"
            onClick={closeCart}
          />
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
                if (checkoutMode === "quotation") {
                  handleOpenNotaPenawaran();
                } else {
                  handleOpenPayment();
                }
              }}
              checkoutMode={checkoutMode}
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
          onSaveDraft={hasServiceItems ? undefined : handleSaveDraft}
          isProcessing={createTransaction.isPending}
          isSavingDraft={createDraft.isPending}
          draftError={draftError}
        />
      )}

      {showNotaPenawaran && (
        <NotaPenawaranModal
          open={showNotaPenawaran}
          onClose={() => {
            setShowNotaPenawaran(false);
            setDraftError(null);
          }}
          items={productCartItems}
          role={role}
          onSubmit={handleCreateNotaPenawaran}
          isSaving={createDraft.isPending}
          error={draftError}
        />
      )}

      {/* Receipt Modal */}
      {lastTransaction && (
        <ReceiptModal
          open={!!lastTransaction}
          onClose={() => {
            setLastTransaction(null);
            setDraftPrintDivision("");
          }}
          transaction={lastTransaction}
          draftPrintDivision={draftPrintDivision}
        />
      )}

      {pendingEmptyStockProduct && (
        <Modal
          open={!!pendingEmptyStockProduct}
          onClose={() => setPendingEmptyStockProduct(null)}
          title="Stok Kosong"
          size="sm"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
              <AlertTriangle size={22} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">
                  {pendingEmptyStockProduct.name}
                </p>
                <p className="mt-1 text-sm">
                  Stok produk ini {pendingEmptyStockProduct.stock}. Item akan
                  masuk ke keranjang untuk nota penawaran, bukan pembayaran
                  langsung.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setPendingEmptyStockProduct(null)}
              >
                Batal
              </Button>
              <Button variant="accent" onClick={handleConfirmEmptyStockProduct}>
                Tambahkan
              </Button>
            </div>
          </div>
        </Modal>
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
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-amber-600"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              Belum Ada Shift Aktif
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Kasir belum membuka shift. Hubungi kasir untuk membuka shift
              terlebih dahulu agar Anda bisa melakukan transaksi.
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

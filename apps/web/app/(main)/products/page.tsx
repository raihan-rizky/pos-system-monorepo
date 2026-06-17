"use client";

import React, { useEffect, useRef, useState, lazy, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  useProductsPage,
  useCategories,
  useProductStats,
  Product,
} from "@/hooks/useProducts";
import {
  Package,
  Search,
  Plus,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  List,
  SlidersHorizontal,
  Edit2,
  History,
  BadgeDollarSign,
  ClipboardList,
  FileSpreadsheet,
  Boxes,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { HorizontalScroll } from "@/components/ui/HorizontalScroll";
import ProductTable from "@/components/inventory/ProductTable";
import { CategoryIcon } from "@/lib/category-icons";
import ProductFormModal from "@/components/inventory/ProductFormModal";
import PriceUpdateModal from "@/components/inventory/PriceUpdateModal";
import StockUpdateModal from "@/components/inventory/StockUpdateModal";
import { useRole } from "@/components/providers/RoleProvider";
import { usePendingInventoryLogCount } from "@/hooks/useInventoryLogs";
import {
  shouldShowAction,
  shouldShowUpdateAction,
} from "@/features/rbac/helpers/rbac-ui";
import { StockGroupWorkspaceModal } from "@/features/product-stock-groups/components/StockGroupWorkspace";
import { formatCompoundStock } from "@/features/product-stock-groups/stock-display";

const StockHistoryTab = lazy(
  () => import("@/app/(main)/inventory/StockHistoryTab"),
);
const StockLogsTab = lazy(() => import("@/app/(main)/inventory/StockLogsTab"));
const ProductPriceLogsTab = lazy(
  () => import("@/app/(main)/products/ProductPriceLogsTab"),
);
const StockGroupActivityTab = lazy(
  () =>
    import("@/features/product-stock-groups/components/StockGroupActivityTab"),
);
const CustomerCategoryPricingRulesTab = lazy(() =>
  import("@/features/customer-category-pricing/components/CustomerCategoryPricingRulesTab").then(
    (mod) => ({ default: mod.CustomerCategoryPricingRulesTab }),
  ),
);
const ProductImportDrawer = lazy(() =>
  import("@/features/product-import/components/ProductImportDrawer").then(
    (mod) => ({ default: mod.ProductImportDrawer }),
  ),
);
const BulkStockDrawer = lazy(() =>
  import("@/features/bulk-stock-adjustment/components/BulkStockDrawer").then(
    (mod) => ({ default: mod.BulkStockDrawer }),
  ),
);
const BulkStockGroupDrawer = lazy(() =>
  import("@/features/product-stock-groups/components/BulkStockGroupDrawer").then(
    (mod) => ({ default: mod.BulkStockGroupDrawer }),
  ),
);

type PageTab =
  | "products"
  | "prices"
  | "special-prices"
  | "history"
  | "logs"
  | "group-activity";

function useFitText(value: string | number) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const raf = requestAnimationFrame(() => {
      const maxSize = 36; // px, setara 2.25rem
      const minSize = 12; // px

      el.style.fontSize = `${maxSize}px`;

      // Baca ulang setelah set, lalu kecilkan sampai muat
      let size = maxSize;
      while (el.scrollWidth > el.clientWidth && size > minSize) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [value]);

  return ref;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);

const PRODUCTS_PER_PAGE = 100;

const intFmt = new Intl.NumberFormat("id-ID");

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
  delay = 0,
}: {
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  accent: string;
  delay?: number;
}) {
  const valueRef = useFitText(value);

  return (
    <div
      className={`group relative overflow-hidden rounded-[24px] p-6 bg-white/60 backdrop-blur-xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-500`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Decorative blurred blob */}
      <div
        className={`absolute -top-10 -right-10 w-32 h-32 rounded-full ${accent} opacity-20 blur-2xl group-hover:opacity-40 transition-opacity duration-500`}
      />

      <div className="relative flex items-start justify-between z-10">
        <div className="min-w-0 flex-1 mr-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            {label}
          </p>
          <p
            ref={valueRef}
            className="font-black text-slate-900 mt-2 tracking-tight whitespace-nowrap overflow-hidden w-full"
          >
            {value}
          </p>
          {sub && (
            <p className="text-xs font-medium text-slate-500 mt-2 flex items-center gap-1.5">
              {sub}
            </p>
          )}
        </div>
        <div
          className={`w-14 h-14 rounded-2xl ${accent} flex items-center justify-center shrink-0 shadow-inner ring-1 ring-white/50 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function ProductsContent() {
  const { canPerform, role } = useRole();
  const canCreateProducts = shouldShowAction("product", "create", canPerform);
  const canUpdateProducts = shouldShowUpdateAction("product", canPerform);
  const canUpdateInventory = shouldShowUpdateAction("inventory", canPerform);
  const canViewPriceHistory = role === "OWNER" || role === "ADMIN";
  const canManageSpecialPrices = role === "OWNER";
  const canChangePrice = canViewPriceHistory;
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // Default to grid on mobile, table on desktop. We'll manage this via state, but default "grid" is safer for initial mobile load.
  const [view, setView] = useState<"table" | "grid">("grid");

  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = (tabParam && ["products", "prices", "special-prices", "history", "logs", "group-activity"].includes(tabParam)
    ? tabParam 
    : "products") as PageTab;
  const [activeTab, setActiveTab] = useState<PageTab>(initialTab);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && ["products", "prices", "special-prices", "history", "logs", "group-activity"].includes(tab)) {
      setActiveTab(tab as PageTab);
    }
  }, [searchParams]);

  const { data: pendingCount = 0 } = usePendingInventoryLogCount();

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockUpdateProductId, setStockUpdateProductId] = useState<
    string | null
  >(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isBulkStockOpen, setIsBulkStockOpen] = useState(false);
  const [isBulkStockGroupOpen, setIsBulkStockGroupOpen] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedPriceLogProductId, setSelectedPriceLogProductId] =
    useState("");
  const [priceUpdateProductId, setPriceUpdateProductId] = useState<
    string | null
  >(null);
  const [stockGroupId, setStockGroupId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out" | "negative">("all");
  const [groupedOnly, setGroupedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<
    "name" | "price_asc" | "price_desc" | "stock_asc"
  >("name");

  const productsQuery = useProductsPage(search, categoryId, {
    page,
    limit: PRODUCTS_PER_PAGE,
    stockStatus:
      stockFilter === "negative" || stockFilter === "out"
        ? stockFilter
        : undefined,
    stockGroupMinVariants: groupedOnly ? 2 : undefined,
  });
  const productsData = productsQuery.data;
  const isLoading = productsQuery.isLoading;
  const isPageFetching = productsQuery.isFetching;

  const statsQuery = useProductStats(search, categoryId);
  const { data: categoriesData } = useCategories();

  const products = React.useMemo(
    () => productsData?.data ?? [],
    [productsData?.data],
  );
  const categories = categoriesData ?? [];

  const pagination = productsData?.pagination;
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  const currentPage = Math.min(
    Math.max(1, pagination?.page ?? page),
    totalPages,
  );

  // Reset to page 1 whenever search, category, or stock filter changes
  useEffect(() => {
    setPage(1);
  }, [search, categoryId, stockFilter, groupedOnly]);

  // Clamp page when result set shrinks (e.g. category change reduces total pages)
  useEffect(() => {
    if (
      pagination &&
      page > pagination.totalPages &&
      pagination.totalPages > 0
    ) {
      setPage(pagination.totalPages);
    }
  }, [pagination, page]);

  const processedProducts = React.useMemo(() => {
    let result = [...products];

    // Status Filter
    if (stockFilter === "low") {
      result = result.filter((p) => p.stock <= p.minStock && p.stock > 0);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "price_asc") return a.price - b.price;
      if (sortBy === "price_desc") return b.price - a.price;
      if (sortBy === "stock_asc") return a.stock - b.stock;
      return 0;
    });

    return result;
  }, [products, stockFilter, sortBy]);

  const stats = statsQuery.data;
  const statsReady = stats !== undefined;
  const totalProducts = stats?.totalProducts ?? 0;
  const lowStock = stats?.lowStock ?? 0;
  const negativeStock = stats?.negativeStock ?? 0;
  const totalValue = stats?.inventoryValue ?? 0;
  const selectedProducts = products.filter((product) =>
    selectedProductIds.has(product.id),
  );

  const openAdd = () => {
    if (!canCreateProducts) return;
    setEditingProductId(null);
    setIsProductModalOpen(true);
  };
  const openEdit = (id: string) => {
    if (!canUpdateProducts) return;
    setEditingProductId(id);
    setIsProductModalOpen(true);
  };
  const closeProduct = () => {
    setIsProductModalOpen(false);
    setEditingProductId(null);
  };
  const openStock = (id: string) => {
    if (!canUpdateInventory) return;
    setStockUpdateProductId(id);
    setIsStockModalOpen(true);
  };
  const closeStock = () => {
    setIsStockModalOpen(false);
    setStockUpdateProductId(null);
  };
  const openPriceHistory = (id: string) => {
    if (!canViewPriceHistory) return;
    setSelectedPriceLogProductId(id);
    setActiveTab("prices");
  };
  const openPriceChange = (id: string) => {
    if (!canChangePrice) return;
    setPriceUpdateProductId(id);
  };
  const closePriceChange = () => {
    setPriceUpdateProductId(null);
  };

  const openStockGroup = (id: string) => {
    setStockGroupId(id);
  };
  const toggleSelectedProduct = (id: string) => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-1 overflow-y-auto w-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/50 via-slate-50 to-purple-50/50 min-h-screen">
      <div className="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-4 xl:px-6 pt-8 pb-24 space-y-8">
        {/* -- Header -- */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/50 border border-blue-200/50 text-blue-700 text-xs font-bold tracking-wide mb-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
              </span>
              INVENTARIS LIVE
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
              Pusat Produk
            </h1>
            <p className="text-base text-slate-500 font-medium">
              Kelola katalog, harga, dan pantau stok secara real-time.
            </p>
          </div>
          {canCreateProducts && (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setIsImportOpen(true)}
                className="group relative flex items-center justify-center gap-2 px-5 py-3.5 w-full md:w-auto rounded-2xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-bold text-sm shadow-sm transition-all duration-300"
              >
                <FileSpreadsheet className="w-5 h-5" />
                <span>Import</span>
              </button>
              <button
                onClick={openAdd}
                className="group relative flex items-center justify-center gap-2 px-6 py-3.5 w-full md:w-auto rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-[0_8px_20px_rgb(0,0,0,0.16)] hover:shadow-[0_12px_25px_rgb(0,0,0,0.25)] transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
              >
                <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                <span>Tambah Produk</span>
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              </button>
            </div>
          )}
        </div>

        {/* -- Stats -- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-5">
          <StatCard
            label="Total Produk"
            value={statsReady ? intFmt.format(totalProducts) : "-"}
            icon={<Package className="w-6 h-6 text-blue-600" />}
            accent="bg-blue-100"
            delay={0}
          />
          <StatCard
            label="Peringatan Stok Menipis"
            value={statsReady ? intFmt.format(lowStock) : "-"}
            sub={
              lowStock > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>{" "}
                  Perlu dicek
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>{" "}
                  Semua stok aman
                </>
              )
            }
            icon={
              <AlertTriangle
                className={`w-6 h-6 ${lowStock > 0 ? "text-red-600 animate-pulse" : "text-amber-600"}`}
              />
            }
            accent={lowStock > 0 ? "bg-red-100" : "bg-amber-100"}
            delay={100}
          />
          <StatCard
            label="Stok Negatif"
            value={statsReady ? intFmt.format(negativeStock) : "-"}
            sub={
              negativeStock > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>{" "}
                  Di bawah nol, perlu dicek
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>{" "}
                  Tidak ada stok negatif
                </>
              )
            }
            icon={
              <TrendingDown
                className={`w-6 h-6 ${negativeStock > 0 ? "text-rose-600 animate-pulse" : "text-slate-500"}`}
              />
            }
            accent={negativeStock > 0 ? "bg-rose-100" : "bg-slate-100"}
            delay={150}
          />
          <StatCard
            label="Nilai Inventaris"
            value={statsReady ? fmt(totalValue) : "-"}
            icon={<TrendingUp className="w-6 h-6 text-emerald-600" />}
            accent="bg-emerald-100"
            delay={200}
          />
        </div>

        {/* -- Tab Navigation -- */}
        <HorizontalScroll
          ariaLabel="Navigasi halaman produk"
          className="p-1.5 bg-slate-100/80 rounded-2xl w-fit max-w-full flex items-center gap-2 flex-nowrap"
          showScrollIndicators={false}
          showEdgeFades={false}
        >
          {[
            {
              id: "products" as PageTab,
              label: "Produk",
              icon: <Package className="w-4 h-4" />,
            },
            ...(canViewPriceHistory
              ? [
                  {
                    id: "prices" as PageTab,
                    label: "Riwayat Harga",
                    icon: <History className="w-4 h-4" />,
                  },
                ]
              : []),
            ...(canManageSpecialPrices
              ? [
                  {
                    id: "special-prices" as PageTab,
                    label: "Harga Khusus",
                    icon: <BadgeDollarSign className="w-4 h-4" />,
                  },
                ]
              : []),
            {
              id: "history" as PageTab,
              label: "Riwayat Stok",
              icon: <History className="w-4 h-4" />,
            },
            {
              id: "logs" as PageTab,
              label: "Stock Logs",
              icon: <ClipboardList className="w-4 h-4" />,
              badge: pendingCount > 0 ? pendingCount : undefined,
            },
            {
              id: "group-activity" as PageTab,
              label: "Aktivitas Grup",
              icon: <Boxes className="w-4 h-4" />,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 shrink-0 whitespace-nowrap ${
                activeTab === tab.id
                  ? "text-slate-900 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {activeTab === tab.id && (
                <span className="absolute inset-0 bg-white rounded-xl shadow-[0_2px_8px_rgb(0,0,0,0.08)] pointer-events-none" />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {tab.icon}
                {tab.label}
                {tab.badge !== undefined && (
                  <span
                    aria-label={`${tab.badge} permintaan menunggu persetujuan`}
                    className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-black"
                  >
                    {tab.badge}
                  </span>
                )}
              </span>
            </button>
          ))}
        </HorizontalScroll>

        {/* -- Tab Content -- */}
        {activeTab !== "products" ? (
          <div className="bg-white/70 backdrop-blur-2xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-[32px] overflow-hidden p-5 md:p-6">
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-20 text-slate-400">
                  <span className="text-sm">Memuat...</span>
                </div>
              }
            >
              {activeTab === "history" && <StockHistoryTab />}
              {activeTab === "logs" && <StockLogsTab />}
              {activeTab === "group-activity" && (
                <StockGroupActivityTab onOpenStockGroup={openStockGroup} />
              )}
              {activeTab === "prices" && canViewPriceHistory && (
                <ProductPriceLogsTab
                  products={products}
                  selectedProductId={selectedPriceLogProductId}
                  onSelectedProductChange={setSelectedPriceLogProductId}
                />
              )}
              {activeTab === "special-prices" && canManageSpecialPrices && (
                <CustomerCategoryPricingRulesTab />
              )}
            </Suspense>
          </div>
        ) : (
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
                  placeholder="Cari nama, SKU, atau barcode..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50/50 hover:bg-slate-50 border border-slate-200/60 rounded-2xl text-sm font-medium placeholder:text-slate-400 text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 focus:bg-white transition-all shadow-inner"
                />
              </div>

              {/* Actions & Toggles */}
              <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0 relative">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center justify-center gap-2 px-4 py-3.5 border rounded-2xl text-sm font-bold transition-all ${showFilters || stockFilter !== "all" || sortBy !== "name" || groupedOnly ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/20" : "bg-slate-50 hover:bg-slate-100 border-slate-200/60 text-slate-700"}`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span className="hidden sm:inline">Filter</span>
                  {(stockFilter !== "all" || sortBy !== "name" || groupedOnly) && (
                    <span className="w-2 h-2 rounded-full bg-blue-400 absolute -top-1 -right-1 border-2 border-white"></span>
                  )}
                </button>

                {/* Filter Dropdown */}
                {showFilters && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setShowFilters(false)}
                    />
                    <div className="absolute top-full right-0 mt-3 w-64 bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-100 p-5 z-30 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="space-y-5">
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              Status Stok
                            </p>
                            {stockFilter !== "all" && (
                              <button
                                onClick={() => setStockFilter("all")}
                                className="text-[10px] font-bold text-blue-600 hover:underline"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {[
                              { id: "all", label: "Semua Barang" },
                              { id: "low", label: "Stok Menipis" },
                              { id: "out", label: "Stok Habis" },
                              { id: "negative", label: "Stok Negatif" },
                            ].map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => {
                                  setStockFilter(opt.id as any);
                                  setShowFilters(false);
                                }}
                                className={`text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${stockFilter === opt.id ? "bg-blue-50 text-blue-600 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="h-px bg-slate-100" />
                        <div>
                          <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Grup Stok
                          </p>
                          <button
                            onClick={() => {
                              setGroupedOnly((value) => !value);
                              setShowFilters(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${groupedOnly ? "bg-blue-50 text-blue-600 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}
                          >
                            Grup 2+ Unit
                          </button>
                        </div>
                        <div className="h-px bg-slate-100" />
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              Urutkan
                            </p>
                            {sortBy !== "name" && (
                              <button
                                onClick={() => setSortBy("name")}
                                className="text-[10px] font-bold text-blue-600 hover:underline"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {[
                              { id: "name", label: "Nama (A-Z)" },
                              { id: "price_asc", label: "Harga (Rendah-Tinggi)" },
                              { id: "price_desc", label: "Harga (Tinggi-Rendah)" },
                              { id: "stock_asc", label: "Stok (Rendah-Tinggi)" },
                            ].map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => {
                                  setSortBy(opt.id as any);
                                  setShowFilters(false);
                                }}
                                className={`text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${sortBy === opt.id ? "bg-blue-50 text-blue-600 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex items-center p-1.5 bg-slate-100/80 rounded-2xl">
                  {(
                    [
                      ["grid", LayoutGrid],
                      ["table", List],
                    ] as const
                  ).map(([v, Icon]) => (
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
            <div className="border-b border-slate-100/80 bg-slate-50/30">
              <HorizontalScroll
                ariaLabel="Filter produk berdasarkan kategori"
                className="px-5 md:px-6 py-4 gap-3 snap-x snap-mandatory"
              >
                <button
                  type="button"
                  onClick={() => setCategoryId("")}
                  aria-pressed={categoryId === ""}
                  className={`snap-start shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 cursor-pointer ${categoryId === "" ? "bg-slate-900 text-white shadow-md shadow-slate-900/20 scale-100" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 scale-95 hover:scale-100"}`}
                >
                  Semua Produk{" "}
                  <span
                    className={`ml-1.5 px-2 py-0.5 rounded-md text-[10px] ${categoryId === "" ? "bg-white/20" : "bg-slate-100"}`}
                  >
                    {statsReady ? intFmt.format(totalProducts) : "…"}
                  </span>
                </button>
                {categories.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    aria-pressed={categoryId === c.id}
                    className={`snap-start shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 cursor-pointer ${categoryId === c.id ? "bg-slate-900 text-white shadow-md shadow-slate-900/20 scale-100" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 scale-95 hover:scale-100"}`}
                  >
                    <CategoryIcon value={c.icon} className="h-4 w-4" />
                    {c.name}
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] ${categoryId === c.id ? "bg-white/20" : "bg-slate-100"}`}
                    >
                      {c._count.products}
                    </span>
                  </button>
                ))}
              </HorizontalScroll>
            </div>

            {/* Content Area */}
            <div className="bg-slate-50/50 min-h-[400px]">
              {view === "table" && (
                <ProductTable
                  products={processedProducts}
                  isLoading={isLoading}
                  onEdit={openEdit}
                  onUpdateStock={openStock}
                  onChangePrice={openPriceChange}
                  onViewStockGroup={openStockGroup}
                  canUpdateProduct={canUpdateProducts}
                  canUpdateStock={canUpdateInventory}
                  canChangePrice={canChangePrice}
                  selectedProductIds={selectedProductIds}
                  onToggleProduct={
                    canUpdateInventory ? toggleSelectedProduct : undefined
                  }
                />
              )}

              {view === "grid" && (
                <ProductGrid
                  products={processedProducts}
                  isLoading={isLoading}
                  onEdit={openEdit}
                  onUpdateStock={openStock}
                  onChangePrice={openPriceChange}
                  onViewStockGroup={openStockGroup}
                  canUpdateProduct={canUpdateProducts}
                  canUpdateStock={canUpdateInventory}
                  canChangePrice={canChangePrice}
                  selectedProductIds={selectedProductIds}
                  onToggleProduct={
                    canUpdateInventory ? toggleSelectedProduct : undefined
                  }
                />
              )}

              {/* No items found */}
              {!isLoading && processedProducts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 px-6">
                  <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <Search className="w-10 h-10 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Produk tidak ditemukan
                  </h3>
                  <p className="text-slate-500 text-center max-w-xs mt-1">
                    Coba ubah pencarian atau filter untuk menemukan produk.
                  </p>
                  {(search || categoryId !== "" || stockFilter !== "all" || groupedOnly) && (
                    <button
                      onClick={() => {
                        setSearch("");
                        setCategoryId("");
                        setStockFilter("all");
                        setGroupedOnly(false);
                      }}
                      className="mt-6 text-sm font-bold text-blue-600 hover:text-blue-700"
                    >
                      Hapus semua filter
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Pagination */}
            {pagination && pagination.total > 0 && (
              <ProductsPager
                page={currentPage}
                totalPages={totalPages}
                total={pagination.total}
                limit={pagination.limit}
                isFetching={isPageFetching}
                onPageChange={(next) => {
                  setPage(next);
                }}
              />
            )}
          </div>
        )}
      </div>

      {isProductModalOpen &&
        (editingProductId ? canUpdateProducts : canCreateProducts) && (
          <ProductFormModal
            isOpen={isProductModalOpen}
            onClose={closeProduct}
            productId={editingProductId}
            categories={categories}
            initialData={products.find((p) => p.id === editingProductId)}
          />
        )}
      {isStockModalOpen && stockUpdateProductId && canUpdateInventory && (
        <StockUpdateModal
          isOpen={isStockModalOpen}
          onClose={closeStock}
          product={products.find((p) => p.id === stockUpdateProductId)!}
        />
      )}
      {priceUpdateProductId && canChangePrice && (
        <PriceUpdateModal
          isOpen={Boolean(priceUpdateProductId)}
          onClose={closePriceChange}
          product={products.find((p) => p.id === priceUpdateProductId) ?? null}
          onViewHistory={openPriceHistory}
        />
      )}
      {stockGroupId && (
        <StockGroupWorkspaceModal
          stockGroupId={stockGroupId}
          onClose={() => setStockGroupId(null)}
          canUpdateStock={canUpdateInventory}
          onSaved={() => {
            productsQuery.refetch();
            statsQuery.refetch();
          }}
        />
      )}
      {selectedProductIds.size > 0 &&
        activeTab === "products" &&
        canUpdateInventory && (
          <div className="fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                <Boxes className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">
                  {selectedProductIds.size} dipilih
                </p>
                <p className="text-xs text-slate-500">
                  Terapkan perubahan stok dalam satu batch.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canUpdateProducts && selectedProductIds.size >= 2 && (
                <button
                  onClick={() => setIsBulkStockGroupOpen(true)}
                  className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white"
                >
                  Grup Stok
                </button>
              )}
              <button
                onClick={() => setIsBulkStockOpen(true)}
                className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white"
              >
                Bulk Stock
              </button>
              <button
                onClick={() => setSelectedProductIds(new Set())}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600"
                aria-label="Hapus pilihan"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      <Suspense fallback={null}>
        {isImportOpen && canCreateProducts && (
          <ProductImportDrawer
            open={isImportOpen}
            onClose={() => setIsImportOpen(false)}
          />
        )}
        {isBulkStockOpen && (
          <BulkStockDrawer
            open={isBulkStockOpen}
            onClose={() => {
              setIsBulkStockOpen(false);
              setSelectedProductIds(new Set());
            }}
            products={selectedProducts}
          />
        )}
        {isBulkStockGroupOpen && (
          <BulkStockGroupDrawer
            open={isBulkStockGroupOpen}
            onClose={() => setIsBulkStockGroupOpen(false)}
            onSaved={() => {
              setSelectedProductIds(new Set());
              productsQuery.refetch();
              statsQuery.refetch();
            }}
            products={selectedProducts}
          />
        )}
      </Suspense>
    </div>
  );
}

/* -- Redesigned Grid View -- */
function ProductGrid({
  products,
  isLoading,
  onEdit,
  onUpdateStock,
  onChangePrice,
  onViewStockGroup,
  canUpdateProduct,
  canUpdateStock,
  canChangePrice,
  selectedProductIds = new Set(),
  onToggleProduct,
}: {
  products: Product[];
  isLoading: boolean;
  onEdit: (id: string) => void;
  onUpdateStock: (id: string) => void;
  onChangePrice: (id: string) => void;
  onViewStockGroup?: (id: string) => void;
  canUpdateProduct: boolean;
  canUpdateStock: boolean;
  canChangePrice: boolean;
  selectedProductIds?: Set<string>;
  onToggleProduct?: (id: string) => void;
}) {
  if (isLoading)
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 p-5 md:p-6 items-stretch">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-[24px] bg-white border border-slate-100 min-h-[260px] p-5 flex flex-col"
          >
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

  if (!products.length)
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-400 px-4 text-center">
        <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center mb-6 shadow-inner">
          <Package className="w-10 h-10 text-slate-300" />
        </div>
        <p className="text-xl font-black text-slate-700">Produk tidak ditemukan</p>
        <p className="text-sm font-medium mt-2 max-w-md">
          Tidak ada produk yang cocok dengan filter saat ini. Coba ubah kata
          pencarian atau kategori.
        </p>
      </div>
    );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 p-5 md:p-6 items-stretch">
      {products.map((p) => {
        const isLow = p.stock <= p.minStock;
        return (
          <div
            key={p.id}
            onClick={() => {
              if (canUpdateProduct) onEdit(p.id);
            }}
            className={`group h-full bg-white rounded-[24px] p-5 border border-slate-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_12px_30px_rgb(0,0,0,0.08)] hover:border-blue-200 transition-all duration-300 flex flex-col gap-4 relative overflow-hidden ${canUpdateProduct ? "cursor-pointer" : ""}`}
          >
            {onToggleProduct && (
              <input
                type="checkbox"
                checked={selectedProductIds.has(p.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={() => onToggleProduct(p.id)}
                className="absolute right-4 top-4 z-30 h-5 w-5 rounded border-slate-300"
                aria-label={`Pilih ${p.name}`}
              />
            )}
            {/* Hover Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-blue-400/20 blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            <div className="flex items-start justify-between relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/80 flex items-center justify-center overflow-hidden shadow-sm group-hover:scale-105 transition-transform duration-300">
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl drop-shadow-sm">
                    <CategoryIcon value={p.category?.icon} className="h-8 w-8 text-slate-500" />
                  </span>
                )}
              </div>

              {isLow && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 border border-red-100 text-red-600 text-[11px] font-bold tracking-wide shadow-sm animate-pulse">
                  <AlertTriangle className="w-3 h-3" /> STOK MENIPIS
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0 mt-1 relative z-10">
              <p
                className="font-black text-slate-800 text-lg leading-snug break-words group-hover:text-blue-600 transition-colors"
                title={p.name}
              >
                {p.name}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold tracking-wider">
                  SKU: {p.sku}
                </span>
                {p.size && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold">
                    {p.size}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-end justify-between pt-4 mt-2 border-t border-slate-100 relative z-10">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Harga
                </p>
                <p className="text-lg font-black text-slate-900 tracking-tight">
                  {fmt(p.price)}
                </p>
                {canChangePrice && p.costPrice !== null && (
                  <>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                      HPP: {fmt(p.costPrice)}
                    </p>
                    <p className="text-[10px] font-bold text-emerald-600 mt-0.5">
                      Margin: {fmt(p.price - p.costPrice)} {p.price > 0 ? `(${((p.price - p.costPrice) / p.price * 100).toFixed(1)}%)` : ""}
                    </p>
                  </>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Stok
                </p>
                <div
                  className={`inline-flex items-baseline gap-1 ${isLow ? "text-red-600" : "text-emerald-600"}`}
                >
                  <span className="text-lg font-black">{formatCompoundStock(p)}</span>
                </div>
              </div>
            </div>

            {(canChangePrice || canUpdateStock || canUpdateProduct) && (
              <div className="grid grid-cols-4 gap-2 relative z-10">
                {p.stockGroupId && onViewStockGroup && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewStockGroup(p.stockGroupId!);
                    }}
                    className="flex h-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 shadow-sm ring-1 ring-sky-100 transition-colors hover:bg-sky-100"
                    title="Lihat Stok Unit"
                  >
                    <Boxes className="w-5 h-5" />
                  </button>
                )}
                {canChangePrice && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangePrice(p.id);
                    }}
                    className="flex h-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 shadow-sm ring-1 ring-amber-100 transition-colors hover:bg-amber-100"
                    title="Ubah Harga"
                  >
                    <BadgeDollarSign className="w-5 h-5" />
                  </button>
                )}
                {canUpdateStock && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateStock(p.id);
                    }}
                    className="flex h-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-100 transition-colors hover:bg-emerald-100"
                    title="Ubah Stok"
                  >
                    <TrendingUp className="w-5 h-5" />
                  </button>
                )}
                {canUpdateProduct && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(p.id);
                    }}
                    className="flex h-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100 transition-colors hover:bg-blue-100"
                    title="Ubah Produk"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProductsPager({
  page,
  totalPages,
  total,
  limit,
  isFetching,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  isFetching: boolean;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return (
      <div className="flex items-center justify-center px-5 md:px-6 py-4 border-t border-slate-100/80 bg-white/40">
        <p className="text-xs font-bold text-slate-500">
          Menampilkan {intFmt.format(total)} dari {intFmt.format(total)}
        </p>
      </div>
    );
  }

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const canPrev = page > 1 && !isFetching;
  const canNext = page < totalPages && !isFetching;

  return (
    <nav
      aria-label="Pagination produk"
      className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 md:px-6 py-4 border-t border-slate-100/80 bg-white/40"
    >
      <p className="text-xs font-bold text-slate-500" aria-live="polite">
        Menampilkan {intFmt.format(start)}-{intFmt.format(end)} dari{" "}
        {intFmt.format(total)}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => canPrev && onPageChange(page - 1)}
          disabled={!canPrev}
          aria-label="Halaman sebelumnya"
          className="flex items-center gap-1.5 h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Sebelumnya</span>
        </button>

        <div
          className={`flex items-center gap-1.5 h-10 px-3 rounded-xl bg-slate-900 text-white text-xs font-black tracking-wide shadow-md shadow-slate-900/20 ${isFetching ? "opacity-80" : ""}`}
          aria-current="page"
        >
          <span>Halaman</span>
          <span className="tabular-nums">{intFmt.format(page)}</span>
          <span className="text-white/60">/</span>
          <span className="tabular-nums">{intFmt.format(totalPages)}</span>
        </div>

        <button
          type="button"
          onClick={() => canNext && onPageChange(page + 1)}
          disabled={!canNext}
          aria-label="Halaman berikutnya"
          className="flex items-center gap-1.5 h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
        >
          <span className="hidden sm:inline">Berikutnya</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
}

interface StockGroupDetail {
  id: string;
  displayName: string;
  baseUnit: string;
  baseStock: number;
  hasNegativeStock: boolean;
  hasDuplicateUnits?: boolean;
  conversionPairs?: Array<{
    fromProductId: string;
    fromUnit: string;
    fromQuantity: number;
    toProductId: string;
    toUnit: string;
    toQuantity: number;
    label: string;
  }>;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    unit: string;
    unitMultiplierToBase: number;
    conversionNeedsReview: boolean;
    stock: number;
    price: number;
  }>;
}

function StockGroupDetailModal({
  stockGroupId,
  onClose,
  canUpdateStock,
  onSaved,
}: {
  stockGroupId: string;
  onClose: () => void;
  canUpdateStock: boolean;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<StockGroupDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharedStock, setSharedStock] = useState("");
  const [stockInputMode, setStockInputMode] = useState<"BASE" | "VARIANT">("BASE");
  const [stockVariantProductId, setStockVariantProductId] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetch(`/api/product-stock-groups/${stockGroupId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat stok unit");
        return (await res.json()) as StockGroupDetail;
      })
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
          setSharedStock(String(data.baseStock));
          setStockVariantProductId(data.variants[0]?.id ?? "");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat stok unit");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stockGroupId]);

  async function saveSharedStock() {
    if (!detail || !Number.isFinite(Number(sharedStock))) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/product-stock-groups/${stockGroupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedStock: Number(sharedStock),
          stockInput:
            stockInputMode === "BASE"
              ? { mode: "BASE" }
              : { mode: "VARIANT", variantProductId: stockVariantProductId },
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message || "Gagal menyimpan stok grup");
      }
      onSaved();
      const next = await fetch(`/api/product-stock-groups/${stockGroupId}`).then(
        (response) => response.json() as Promise<StockGroupDetail>,
      );
      setDetail(next);
      setSharedStock(String(next.baseStock));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan stok grup");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-sm font-black text-slate-900">
              {detail?.displayName ?? "Stok Unit"}
            </p>
            {detail && (
              <p className="mt-1 text-xs text-slate-500">
                Base: {detail.baseStock} {detail.baseUnit}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {isLoading && (
            <div className="py-10 text-center text-sm font-semibold text-slate-500">
              Memuat...
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}
          {detail && (
            <div className="space-y-3">
              {detail.hasNegativeStock && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  Stok bersama bernilai negatif.
                </div>
              )}
              {detail.hasDuplicateUnits && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  Grup memiliki unit duplikat dan perlu direview.
                </div>
              )}
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Konversi Saat Ini
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(detail.conversionPairs ?? []).length > 0 ? (
                    detail.conversionPairs?.map((pair) => (
                      <span
                        key={`${pair.fromProductId}:${pair.toProductId}`}
                        className="rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-black text-sky-700 ring-1 ring-sky-100"
                      >
                        {pair.label}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm font-semibold text-slate-500">
                      Belum ada pair konversi antar unit.
                    </span>
                  )}
                </div>
              </div>
              {canUpdateStock && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="text-xs font-bold text-slate-600">
                      Shared Stock
                      <input
                        value={sharedStock}
                        onChange={(event) => setSharedStock(event.target.value)}
                        inputMode="decimal"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Unit Input
                      <select
                        value={stockInputMode === "BASE" ? "BASE" : stockVariantProductId}
                        onChange={(event) => {
                          if (event.target.value === "BASE") {
                            setStockInputMode("BASE");
                          } else {
                            setStockInputMode("VARIANT");
                            setStockVariantProductId(event.target.value);
                          }
                        }}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="BASE">{detail.baseUnit}</option>
                        {detail.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.unit}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Catatan
                      <input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={saveSharedStock}
                    disabled={isSaving || sharedStock.trim() === ""}
                    className="mt-3 h-10 rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:bg-slate-300"
                  >
                    {isSaving ? "Menyimpan..." : "Simpan Shared Stock"}
                  </button>
                </div>
              )}
              {detail.variants.map((variant) => (
                <div
                  key={variant.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-black text-slate-900">
                      {variant.name}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {variant.sku} · multiplier {variant.unitMultiplierToBase}
                    </p>
                    {variant.conversionNeedsReview && (
                      <span className="mt-2 inline-flex rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700 ring-1 ring-amber-100">
                        Perlu review konversi
                      </span>
                    )}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-base font-black tabular-nums text-slate-900">
                      {formatCompoundStock({
                        stock: variant.stock,
                        unit: variant.unit,
                        unitMultiplierToBase: variant.unitMultiplierToBase,
                        stockGroup: {
                          baseUnit: detail.baseUnit,
                        },
                      })}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {fmt(variant.price)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-sm text-slate-400 font-medium">Memuat halaman...</span>
      </div>
    }>
      <ProductsContent />
    </Suspense>
  );
}

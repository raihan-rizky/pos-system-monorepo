"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ReceiptModal } from "@/components/ReceiptModal";
import { useTransactionHistory } from "@/hooks/useTransactions";
import { useCategories } from "@/hooks/useProducts";
import { formatRupiah, formatDate } from "@/lib/utils";
import { Button } from "@pos/ui";

export default function HistoryPage() {
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

  // Filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);

  // Debounce search
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  // Fetch data
  const { data: categories = [] } = useCategories();
  const { data: result, isLoading } = useTransactionHistory({
    search: debouncedSearch,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    categoryId: categoryId || undefined,
    page,
  });

  const transactions = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;

  const hasActiveFilters = debouncedSearch || dateFrom || dateTo || categoryId;

  const resetFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setDateFrom("");
    setDateTo("");
    setCategoryId("");
    setPage(1);
  };

  // Calculate display range
  const startItem = total === 0 ? 0 : (page - 1) * 10 + 1;
  const endItem = Math.min(page * 10, total);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50">
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col ml-0 md:ml-[72px] overflow-hidden pb-16 md:pb-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-8 py-4 md:py-6 bg-white border-b border-surface-100">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-surface-900">Riwayat Transaksi</h1>
            <p className="text-sm text-surface-500 mt-1">
              Daftar seluruh transaksi dan invoice toko
            </p>
          </div>
        </header>

        {/* Filters */}
        <div className="px-4 md:px-8 py-4 bg-white border-b border-surface-100 space-y-3">
          {/* Row 1: Search + Category */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="history-search"
                type="text"
                placeholder="Cari invoice, pelanggan, atau nama produk..."
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              />
            </div>

            {/* Category Dropdown */}
            <select
              id="history-category-filter"
              value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
              className="px-4 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-sm
                focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all
                min-w-[180px]"
            >
              <option value="">Semua Kategori</option>
              {categories.map((cat: any) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Row 2: Dates + Reset */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-surface-500 whitespace-nowrap">Dari</label>
              <input
                id="history-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-xl border border-surface-200 bg-surface-50 text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-surface-500 whitespace-nowrap">Sampai</label>
              <input
                id="history-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-xl border border-surface-200 bg-surface-50 text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              />
            </div>

            {hasActiveFilters && (
              <button
                id="history-reset-filters"
                onClick={resetFilters}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-danger-600 bg-danger-50 hover:bg-danger-100 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Reset Filter
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
            {isLoading ? (
              <div className="p-8 flex items-center justify-center">
                <p className="text-surface-400">Loading history data...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-surface-400">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 opacity-50">
                  <path d="M12 8v4l3 3" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
                <p className="font-medium text-surface-600">
                  {hasActiveFilters ? "Tidak ada transaksi yang cocok dengan filter." : "Belum ada transaksi."}
                </p>
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium underline"
                  >
                    Reset semua filter
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-50 border-b border-surface-200">
                        <th className="py-4 px-6 font-semibold text-sm text-surface-600">Tanggal</th>
                        <th className="py-4 px-6 font-semibold text-sm text-surface-600">No. Invoice</th>
                        <th className="py-4 px-6 font-semibold text-sm text-surface-600">Pelanggan</th>
                        <th className="py-4 px-6 font-semibold text-sm text-surface-600">Item</th>
                        <th className="py-4 px-6 font-semibold text-sm text-surface-600">Total</th>
                        <th className="py-4 px-6 font-semibold text-sm text-surface-600 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {transactions.map((tx: any) => (
                        <tr key={tx.id} className="hover:bg-surface-50 transition-colors">
                          <td className="py-4 px-6 text-sm text-surface-900">
                            {formatDate(new Date(tx.createdAt))}
                          </td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-surface-100 text-surface-700">
                              {tx.invoiceNumber}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-sm text-surface-700 font-medium">
                            {tx.customerName || "Pelanggan Umum"}
                          </td>
                          <td className="py-4 px-6 text-sm text-surface-600">
                            {tx.items.length} Barang
                          </td>
                          <td className="py-4 px-6 text-sm font-bold text-brand-600">
                            {formatRupiah(Number(tx.total))}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <Button
                              variant="secondary"
                              onClick={() => setSelectedTransaction(tx)}
                              className="!py-1.5 !px-3 text-sm h-auto"
                            >
                              Lihat Struk
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-surface-100 gap-3">
                  <p className="text-sm text-surface-500">
                    Menampilkan <span className="font-semibold text-surface-700">{startItem}–{endItem}</span> dari{" "}
                    <span className="font-semibold text-surface-700">{total}</span> transaksi
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      id="history-prev-page"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-surface-200 text-sm font-medium
                        text-surface-600 hover:bg-surface-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                      Prev
                    </button>
                    <span className="px-3 py-2 rounded-xl bg-brand-50 text-brand-700 text-sm font-bold min-w-[40px] text-center">
                      {page}
                    </span>
                    <span className="text-sm text-surface-400">dari {totalPages}</span>
                    <button
                      id="history-next-page"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-surface-200 text-sm font-medium
                        text-surface-600 hover:bg-surface-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Receipt View Modal */}
      {selectedTransaction && (
        <ReceiptModal
          open={!!selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          transaction={selectedTransaction}
        />
      )}
    </div>
  );
}

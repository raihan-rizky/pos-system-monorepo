"use client";

import React, { useState, useDeferredValue, useCallback, useMemo } from "react";
import {
  Search,
  Wallet,
  FileSpreadsheet,
  Loader2,
  Calendar,
  Phone,
  X,
  CreditCard,
  Building2,
  ArrowRight,
  User,
  CheckCircle2,
  Clock
} from "lucide-react";
import { useTransactionHistory, Transaction } from "@/hooks/useTransactions";
import { usePayTransactionDebt } from "@/hooks/useCustomers";
import { useDebounce } from "@/hooks/useDebounce";
import { ReceiptModal } from "@/components/ReceiptModal";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function calculateDaysDifference(dateStr: string): number {
  const diffTime = Math.abs(new Date().getTime() - new Date(dateStr).getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getAgeColorClasses(days: number): string {
  if (days <= 3) return "text-red-400 font-bold";
  if (days <= 7) return "text-red-500 font-bold";
  if (days <= 14) return "text-red-600 font-black";
  if (days <= 30) return "text-red-700 font-black";
  return "text-red-800 font-black";
}

const PAYMENT_METHODS = [
  { value: "CASH", label: "Tunai" },
  { value: "QRIS", label: "QRIS" },
  { value: "DEBIT", label: "Debit" },
  { value: "TRANSFER", label: "Transfer" },
] as const;

function SingleTransactionPayModal({
  transaction,
  onClose,
}: {
  transaction: Transaction;
  onClose: () => void;
}) {
  const payTx = usePayTransactionDebt();
  const remaining = Number(transaction.total) - Number(transaction.amountPaid);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>(["CASH"]);
  const [amountsPaid, setAmountsPaid] = useState<Record<string, number>>({ CASH: remaining });
  const totalAmount = selectedPaymentMethods.reduce((sum, method) => sum + (amountsPaid[method] || 0), 0);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const handlePay = async () => {
    setError("");
    if (!totalAmount || totalAmount <= 0) {
      setError("Nominal harus lebih dari 0");
      return;
    }
    if (totalAmount > remaining) {
      setError("Nominal melebihi sisa tagihan");
      return;
    }

    try {
      const payments = selectedPaymentMethods.map(method => ({
        method,
        amount: amountsPaid[method] || 0,
      })).filter(p => p.amount > 0);

      const primaryPaymentMethod = payments.length > 0
        ? payments.reduce((primary, p) => p.amount > primary.amount ? p : primary, payments[0]).method
        : selectedPaymentMethods[0];

      await payTx.mutateAsync({
        transactionId: transaction.id,
        customerId: transaction.customerId ?? undefined,
        amount: totalAmount,
        paymentMethod: primaryPaymentMethod,
        payments,
        note,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal memproses pembayaran");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 rounded-[24px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <h3 className="text-base font-black text-slate-900">Bayar Piutang Invoice</h3>
            <p className="text-xs font-semibold text-slate-500">{transaction.invoiceNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500">Sisa Tagihan</span>
              <span className="text-sm font-black text-red-600">{formatCurrency(remaining)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Pelanggan</span>
              <span className="text-sm font-bold text-slate-900">
                {transaction.customerName || "Umum"}
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Metode Pembayaran (Bisa Pilih Lebih Dari Satu)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((pm) => (
                <button
                  key={pm.value}
                  type="button"
                  onClick={() => {
                    setSelectedPaymentMethods(prev => {
                      if (prev.includes(pm.value)) {
                        if (prev.length === 1) return prev;
                        const next = prev.filter(m => m !== pm.value);
                        setAmountsPaid(curr => {
                          const newAmounts = { ...curr };
                          delete newAmounts[pm.value];
                          return newAmounts;
                        });
                        return next;
                      }
                      return [...prev, pm.value];
                    });
                  }}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                    selectedPaymentMethods.includes(pm.value)
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {pm.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {selectedPaymentMethods.map(methodValue => {
              const methodDef = PAYMENT_METHODS.find(m => m.value === methodValue);
              return (
                <div key={methodValue} className="rounded-xl border border-slate-200 p-3">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Nominal Bayar ({methodDef?.label})
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">Rp</span>
                    <input
                      type="number"
                      value={amountsPaid[methodValue] || ""}
                      onChange={(e) => setAmountsPaid(prev => ({ ...prev, [methodValue]: Number(e.target.value) || 0 }))}
                      min={0}
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-bold text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAmountsPaid(prev => ({
                        ...prev,
                        [methodValue]: remaining - (totalAmount - (prev[methodValue] || 0))
                      }))}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200"
                    >
                      Lunasi Sisa ({formatCurrency(remaining - (totalAmount - (amountsPaid[methodValue] || 0)))})
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Catatan Pembayaran (Opsional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: Titip ke kasir sore"
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-4">
          <button
            onClick={handlePay}
            disabled={payTx.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {payTx.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CreditCard className="h-5 w-5" />
            )}
            Proses Pembayaran
          </button>
        </div>
      </div>
    </div>
  );
}

export function DebtTransactionsList() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const debouncedSearch = useDebounce(deferredSearch, 250);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [paymentStatus, setPaymentStatus] = useState<"ALL" | "DP" | "COMPLETED">("ALL");
  const [customerType, setCustomerType] = useState<string>("");

  const [payingTx, setPayingTx] = useState<Transaction | null>(null);
  const [viewingTx, setViewingTx] = useState<Transaction | null>(null);

  const { data, isLoading, isFetching } = useTransactionHistory({
    status: paymentStatus === "ALL" ? "DEBT_HISTORY" : paymentStatus === "DP" ? "DP" : "DEBT_HISTORY_COMPLETED", // Custom status parameter for backend
    search: debouncedSearch,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    customerType: customerType || undefined,
  });

  const transactions = data?.data ?? [];
  const totalItems = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.totalPages ?? 1;
  const loadingLabel = isLoading
    ? "Memuat data piutang..."
    : isFetching
      ? "Memperbarui data piutang..."
      : null;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setPage(1);
    },
    []
  );

  const handleFilterCustomer = useCallback((customerName: string) => {
    setSearch(customerName);
    setPage(1);
  }, []);

  const handleQuickFilter = useCallback((days: number) => {
    const to = new Date();
    const from = new Date();
    if (days > 0) {
      from.setDate(to.getDate() - days);
    }
    
    setDateTo(to.toISOString().split("T")[0]);
    setDateFrom(from.toISOString().split("T")[0]);
    setPage(1);
  }, []);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={handleSearchChange}
              placeholder="Cari pelanggan atau nomor invoice..."
              className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 lg:border-none lg:pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 mr-1 hidden sm:block">Filter Cepat:</span>
            <button
              onClick={() => handleQuickFilter(0)}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
            >
              Harian
            </button>
            <button
              onClick={() => handleQuickFilter(7)}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
            >
              Mingguan
            </button>
            <button
              onClick={() => handleQuickFilter(30)}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
            >
              Bulanan
            </button>
            <button
              onClick={() => handleQuickFilter(365)}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
            >
              Tahunan
            </button>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-[140px] rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              />
            </div>
            <span className="text-slate-400">-</span>
            <div className="relative">
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-[140px] rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-2 text-sm text-slate-500">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setPaymentStatus("ALL"); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                paymentStatus === "ALL" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => { setPaymentStatus("DP"); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                paymentStatus === "DP" ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Belum Lunas
            </button>
            <button
              onClick={() => { setPaymentStatus("COMPLETED"); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                paymentStatus === "COMPLETED" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Lunas
            </button>
          </div>

          <div className="hidden sm:block h-6 w-px bg-slate-200"></div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setCustomerType(""); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                customerType === "" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Semua Tipe
            </button>
            <button
              onClick={() => { setCustomerType("UMUM"); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                customerType === "UMUM" ? "bg-slate-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              UMUM
            </button>
            <button
              onClick={() => { setCustomerType("AGEN"); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                customerType === "AGEN" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              AGEN
            </button>
            <button
              onClick={() => { setCustomerType("INDUSTRI"); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                customerType === "INDUSTRI" ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              INDUSTRI
            </button>
            <button
              onClick={() => { setCustomerType("PEMERINTAH"); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                customerType === "PEMERINTAH" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              PEMERINTAH
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-bold">{totalItems} invoice / tagihan</span>
          {loadingLabel && (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {loadingLabel}
            </span>
          )}
        </div>
      </div>

      {/* List */}
      <div className="min-w-0 space-y-3">
        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center justify-center rounded-[32px] border border-slate-200 bg-white/80 px-6 py-14 text-center shadow-sm"
          >
            <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
            <h2 className="mt-5 text-lg font-black text-slate-900">Memuat data piutang</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Sistem sedang mengambil daftar invoice dan histori pembayaran.
            </p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="rounded-[32px] border border-dashed border-slate-300 bg-white/80 px-6 py-14 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-slate-100 text-slate-500">
              <FileSpreadsheet className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-xl font-black text-slate-900">Tidak ada data tagihan</h2>
            <p className="mt-2 text-sm text-slate-500">
              Daftar tagihan atau histori piutang akan muncul di sini.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop View: Table */}
            <div className="hidden lg:block overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">Pelanggan</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">Invoice</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">Tagihan & Sisa</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">Status & Waktu</th>
                      <th className="px-6 py-4 text-right font-bold uppercase tracking-wider">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((tx) => {
                      const isCompleted = tx.status === "COMPLETED";
                      const remaining = Number(tx.total) - Number(tx.amountPaid);
                      const daysOld = calculateDaysDifference(tx.createdAt);
                      const cName = tx.customerName || "Pelanggan Umum";
                      const paymentLog = tx.debtPaymentLogs?.[0];

                      return (
                        <tr key={tx.id} className="transition-colors hover:bg-slate-50">
                          <td className="px-6 py-4">
                            <button
                              onClick={() => handleFilterCustomer(cName)}
                              className="group flex items-center gap-3 text-left outline-none"
                            >
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-black text-slate-700 transition group-hover:bg-brand-100 group-hover:text-brand-700">
                                {tx.customerName ? getInitials(tx.customerName) : <User className="h-4 w-4" />}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 transition group-hover:text-brand-600">
                                  {cName}
                                </div>
                              </div>
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-900">{tx.invoiceNumber}</div>
                            <div className="mt-1 text-xs font-semibold text-slate-500">{formatDate(tx.createdAt)}</div>
                            <button
                              onClick={() => setViewingTx(tx)}
                              className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:underline"
                            >
                              Lihat <ArrowRight className="h-3 w-3" />
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-900">{formatCurrency(Number(tx.total))}</div>
                            {!isCompleted && (
                              <>
                                <div className="mt-1 text-xs font-bold text-red-600">
                                  Sisa: {formatCurrency(remaining)}
                                </div>
                                <div className="mt-0.5 text-[11px] font-bold text-emerald-600">
                                  Dibayar (DP): {formatCurrency(Number(tx.amountPaid))}
                                </div>
                              </>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {isCompleted ? (
                              <div>
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700 uppercase">
                                  <CheckCircle2 className="h-3 w-3" /> Lunas
                                </span>
                                {paymentLog && (
                                  <div className="mt-1.5 text-xs font-semibold text-slate-500">
                                    Dilunasi: {formatDate(paymentLog.createdAt)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-black text-red-700 uppercase">
                                  <Clock className="h-3 w-3" /> Belum Lunas
                                </span>
                                <div className={`mt-1.5 text-xs ${getAgeColorClasses(daysOld)}`}>
                                  Usia Tagihan: {daysOld} hari
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {!isCompleted ? (
                              <button
                                onClick={() => setPayingTx(tx)}
                                className="inline-flex items-center justify-center rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-600 hover:text-white"
                              >
                                Bayar Piutang
                              </button>
                            ) : (
                              <span className="text-xs font-bold text-slate-400">Selesai</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile View: Cards */}
            <div className="grid gap-3 lg:hidden sm:grid-cols-2">
              {transactions.map((tx) => {
                const isCompleted = tx.status === "COMPLETED";
                const remaining = Number(tx.total) - Number(tx.amountPaid);
                const daysOld = calculateDaysDifference(tx.createdAt);
                const cName = tx.customerName || "Pelanggan Umum";
                const paymentLog = tx.debtPaymentLogs?.[0];

                return (
                  <div
                    key={tx.id}
                    className="flex flex-col rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between mb-3 border-b border-slate-100 pb-3">
                      <button
                        onClick={() => handleFilterCustomer(cName)}
                        className="group flex items-center gap-3 text-left outline-none"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-black text-slate-700 transition group-hover:bg-brand-100 group-hover:text-brand-700">
                          {tx.customerName ? getInitials(tx.customerName) : <User className="h-4 w-4" />}
                        </div>
                        <div>
                          <div className="text-sm font-black text-slate-900 group-hover:text-brand-600 transition">
                            {cName}
                          </div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Klik untuk filter
                          </div>
                        </div>
                      </button>
                      <div className="text-right">
                        {isCompleted ? (
                           <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700 uppercase">
                             Lunas
                           </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700 uppercase">
                            Belum Lunas
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col gap-1.5 mb-4">
                      <div className="flex justify-between items-center text-sm mb-1">
                        <div>
                          <div className="font-bold text-slate-900">{tx.invoiceNumber}</div>
                          <div className="text-xs font-semibold text-slate-500">{formatDate(tx.createdAt)}</div>
                        </div>
                        <button 
                          onClick={() => setViewingTx(tx)}
                          className="text-[11px] font-bold text-brand-600 hover:underline flex items-center gap-1"
                        >
                          Lihat <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>

                      <div className="flex justify-between text-sm mt-2">
                        <span className="text-slate-500">Total Transaksi</span>
                        <span className="font-bold text-slate-900">{formatCurrency(Number(tx.total))}</span>
                      </div>
                      
                      {!isCompleted ? (
                        <>
                          <div className="flex justify-between text-sm mt-1 pt-1 border-t border-slate-50">
                            <span className="font-bold text-slate-700">Sisa Tagihan</span>
                            <span className="font-black text-red-600 text-base">{formatCurrency(remaining)}</span>
                          </div>
                          <div className="flex justify-between text-xs mt-1">
                            <span className="font-semibold text-slate-500">Dibayar (DP)</span>
                            <span className="font-bold text-emerald-600">{formatCurrency(Number(tx.amountPaid))}</span>
                          </div>
                          <div className="mt-2 text-right">
                             <span className={`text-xs ${getAgeColorClasses(daysOld)}`}>
                                Usia Tagihan: {daysOld} hari
                             </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-sm mt-1 pt-1 border-t border-slate-50">
                            <span className="font-bold text-slate-700">Waktu Pelunasan</span>
                            <span className="font-black text-emerald-600 text-sm">
                              {paymentLog ? formatDate(paymentLog.createdAt) : formatDate(tx.createdAt)}
                            </span>
                        </div>
                      )}
                    </div>

                    {!isCompleted && (
                      <button
                        onClick={() => setPayingTx(tx)}
                        className="w-full rounded-xl bg-red-50 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-600 hover:text-white"
                      >
                        Bayar Piutang
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between rounded-[24px] border border-slate-200 bg-white p-4">
            <span className="text-sm font-semibold text-slate-500">
              Halaman {page} dari {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
              >
                Sebelumnnya
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {payingTx && (
        <SingleTransactionPayModal
          transaction={payingTx}
          onClose={() => setPayingTx(null)}
        />
      )}

      {viewingTx && (
        <ReceiptModal
          open={!!viewingTx}
          onClose={() => setViewingTx(null)}
          transaction={viewingTx}
        />
      )}
    </div>
  );
}




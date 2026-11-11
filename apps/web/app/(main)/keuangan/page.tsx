"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button, Modal } from "@pos/ui";
import { ChevronRight, MoreVertical, Plus } from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import { useAssistantModalAction } from "@/features/ai-assistant/hooks/useAssistantModalAction";
import {
  useCashFlowSummary,
  useIncomeSummary,
  useExpenseSummary,
  useExpenseList,
  useCustomExpenseCategories,
  type ExpenseListItem,
} from "@/features/keuangan/hooks/useKeuangan";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategoryKey,
} from "@/features/keuangan/helpers/keuangan-core";
import {
  CATEGORY_LABELS_ID,
  customExpenseCategoryKey,
  expenseCategoryColor,
  expenseCategoryLabel,
} from "@/features/keuangan/helpers/category-meta";
import type { ExpenseFormInitial } from "@/features/keuangan/components/ExpenseFormModal";
import { DeferredCashFlowChart } from "@/features/keuangan/components/DeferredCashFlowChart";
import { SupplierPayablesPanel } from "@/features/keuangan/components/SupplierPayablesPanel";
import { ManualIncomePanel } from "@/features/keuangan/components/ManualIncomePanel";
import { IncomeDayRow } from "@/features/keuangan/components/IncomeDayRow";
import { ManualFinanceFormModal, type ManualFinanceInitial } from "@/features/keuangan/components/ManualFinanceFormModal";
import { formatRupiah, formatRupiahPrecise } from "@/lib/utils";

const ExpenseFormModal = dynamic(
  () =>
    import("@/features/keuangan/components/ExpenseFormModal").then(
      (module) => module.ExpenseFormModal,
    ),
  { ssr: false },
);

const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function currentJakartaMonth(): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return ymd.slice(0, 7);
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES_ID[m - 1]} ${y}`;
}

function fullDay(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00+07:00`));
}

function fullDayShort(iso: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
  }).format(new Date(iso));
}

const FLOW_COLOR_INCOME = "#10B981";
const FLOW_COLOR_EXPENSE = "#EF4444";

export default function KeuanganDashboardPage() {
  const searchParams = useSearchParams();
  const month = searchParams.get("month") || currentJakartaMonth();
  const queryClient = useQueryClient();
  const { canPerform, canAccess } = useRole();
  const canOpenIncomeHistory = canAccess("/history") && canAccess("/financial-report") && canPerform("transaction", "read") && (canPerform("financial-report", "read") || canPerform("financial-report.daily-income", "read"));
  const canReadIncome = canPerform("income", "read");
  const canReadExpense = canPerform("expense", "read");
  const canCreate = canPerform("expense", "create");
  const canEdit = canPerform("expense", "update");
  const canDelete = canPerform("expense", "delete");
  const canCreateTransfer = canPerform("expense.manual_transfer", "create");
  const canEditTransfer = canPerform("expense.manual_transfer", "update");
  const canDeleteTransfer = canPerform("expense.manual_transfer", "delete");
  const canReadPayables = canPerform("expense.payable", "read");
  const canCreatePayables = canPerform("expense.payable", "create");
  const canUpdatePayables = canPerform("expense.payable", "update");
  const canReadGiro = canPerform("expense.giro", "read");
  const canUpdateGiro = canPerform("expense.giro", "update");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<ExpenseFormInitial | undefined>();
  const [transferModal, setTransferModal] = useState<{ initial?: ManualFinanceInitial } | null>(null);
  const [page, setPage] = useState(1);
  const [filterCategory, setFilterCategory] = useState<ExpenseCategoryKey | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const canReadCashFlow = canReadIncome && canReadExpense;
  const pemasukan = useIncomeSummary(month, canReadIncome, canReadCashFlow);
  const pengeluaran = useExpenseSummary(month, canReadExpense, canReadCashFlow);
  const cashFlow = useCashFlowSummary(month, canReadCashFlow);
  const list = useExpenseList(month, page, filterCategory, canReadExpense);
  const categoryQuery = useCustomExpenseCategories(canReadExpense);
  const customCategories = canReadExpense ? categoryQuery.data?.data ?? [] : [];
  const incomeData = canReadIncome && !pemasukan.isError ? pemasukan.data : undefined;
  const expenseData = canReadExpense && !pengeluaran.isError ? pengeluaran.data : undefined;
  const cashFlowData = canReadCashFlow && !cashFlow.isError ? cashFlow.data : undefined;

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["finance"] }),
    [queryClient],
  );

  const openCreateExpense = useCallback(() => {
    if (!canCreate) return;
    setEditing(undefined);
    setModalMode("create");
    setModalOpen(true);
  }, [canCreate]);
  useAssistantModalAction("expense-create", openCreateExpense);
  const openCreateTransfer = useCallback(() => {
    if (canCreateTransfer) setTransferModal({});
  }, [canCreateTransfer]);
  useAssistantModalAction("manual-transfer-create", openCreateTransfer);

  const handleEdit = useCallback((item: ExpenseListItem) => {
    if (item.source.type === "MANUAL_TRANSFER_PURCHASE") {
      setTransferModal({ initial: { id: item.id, applicantName: item.applicantName, description: item.description, amount: item.amount, occurredAt: item.occurredAt, attachmentUrl: item.attachmentUrl } });
      return;
    }
    setEditing({
      id: item.id,
      applicantName: item.applicantName,
      category: item.category,
      description: item.description,
      amount: item.amount,
      changeAmount: item.changeAmount,
      occurredAt: item.occurredAt,
      transactionId: item.transactionId,
      attachmentUrl: item.attachmentUrl,
    });
    setModalMode("edit");
    setModalOpen(true);
  }, []);

  const handleDelete = useCallback(async (item: ExpenseListItem) => {
    if (!confirm(`Hapus pengeluaran ${item.applicantName}?`)) return;
    const res = await fetch(`/api/finance/expenses/${item.id}`, { method: "DELETE" });
    if (res.ok) refresh();
    else alert("Gagal menghapus");
  }, [refresh]);

  const stripeData = useMemo(() => {
    if (!expenseData || expenseData.byCategory.length === 0) return [];
    const total = expenseData.byCategory.reduce((s, c) => s + c.total, 0);
    return expenseData.byCategory.map((c) => ({
      ...c,
      pct: total > 0 ? (c.total / total) * 100 : 0,
    }));
  }, [expenseData]);

  const cashIncome = canReadCashFlow ? cashFlowData?.income.total : incomeData?.cashTotal;
  const cashExpense = canReadCashFlow ? cashFlowData?.expense.total : expenseData?.cashExpense?.total;
  const net = canReadCashFlow && cashIncome != null && cashExpense != null ? Math.round((cashIncome - cashExpense) * 100) / 100 : null;
  const isNegative = net !== null && net < 0;
  const cashIncomplete = canReadCashFlow ? cashFlowData?.expense.incomplete === true : expenseData?.cashExpense?.incomplete === true;
  const summaryLoading = canReadCashFlow ? cashFlow.isLoading : (canReadIncome && pemasukan.isLoading) || (canReadExpense && pengeluaran.isLoading);

  return (
    <div className="px-2 sm:px-3 py-2 sm:py-3 max-w-6xl mx-auto space-y-3 sm:space-y-4">
      {/* ───────── Hero — Net Cash Flow ───────── */}
      <section
        className={`relative overflow-hidden rounded-2xl sm:rounded-3xl border shadow-sm ${
          isNegative
            ? "border-red-100 bg-gradient-to-br from-red-50 via-white to-white"
            : "border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white"
        }`}
      >
        <div className="px-3 py-3 sm:px-4 sm:py-4 md:px-5 md:py-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-4">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.16em] sm:tracking-[0.18em] text-surface-500">
              Net Cash Flow {monthLabel(month)}
            </p>
            {summaryLoading ? (
              <div className="h-10 sm:h-12 w-56 sm:w-72 mt-2 rounded-md bg-surface-100 animate-pulse" />
            ) : (
              <p
                className={`mt-1 text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight tabular-nums break-words ${
                  isNegative ? "text-red-600" : "text-emerald-700"
                }`}
              >
                {net === null ? "Belum tersedia" : formatRupiahPrecise(net)}
              </p>
            )}
            {!summaryLoading && (
              <p className="mt-1.5 text-[11px] sm:text-xs text-surface-500 tabular-nums">
                <span className="block sm:inline">
                  {!canReadIncome ? "Tidak memiliki akses pemasukan" : cashIncome == null ? "Pemasukan belum tersedia" : `${formatRupiahPrecise(cashIncome)} pemasukan`}
                </span>
                <span className="hidden sm:inline"> · </span>
                <span className="block sm:inline">
                  {!canReadExpense ? "Tidak memiliki akses pengeluaran" : cashExpense == null ? "Pengeluaran belum tersedia" : `${formatRupiah(cashExpense)} pengeluaran`}
                </span>
              </p>
            )}
            {!summaryLoading && canReadIncome && cashIncome != null && <p className="mt-1 text-xs text-surface-500">Arus kas termasuk pelunasan piutang manual.</p>}
            {!summaryLoading && cashIncomplete && (
              <p role="status" className="mt-1 text-xs text-amber-700">Riwayat giro atau belanja belum lengkap. Periksa riwayat giro untuk menghitung sisa kas.</p>
            )}
          </div>
          {canCreate && (
            <Button
              onClick={openCreateExpense}
              className="w-full md:w-auto justify-center"
              icon={
                <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden="true" />
              }
            >
              Tambah Pengeluaran
            </Button>
          )}
        </div>
      </section>

      {(canReadPayables || canCreatePayables || canReadGiro) && <SupplierPayablesPanel canRead={canReadPayables} canCreate={canCreatePayables} canUpdate={canUpdatePayables} canReadGiro={canReadGiro} canUpdateGiro={canUpdateGiro} />}

      {/* ───────── Bidirectional Daily Flow ───────── */}
      <section className="rounded-2xl border border-surface-200 bg-white p-3 sm:p-4 md:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-surface-900">Arus Kas Harian</h2>
          <div className="flex items-center gap-2 sm:gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: FLOW_COLOR_INCOME }} />
              <span className="text-surface-600 font-medium">Pemasukan</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: FLOW_COLOR_EXPENSE }} />
              <span className="text-surface-600 font-medium">Pengeluaran</span>
            </span>
          </div>
        </div>
        {cashIncomplete && <p className="mb-2 text-xs text-amber-700">Grafik hanya menampilkan pembayaran yang diketahui; riwayat giro belum lengkap.</p>}
        {!canReadIncome || !canReadExpense ? (
          <p className="py-6 text-center text-sm text-surface-500">Grafik memerlukan akses pemasukan dan pengeluaran.</p>
        ) : !summaryLoading && !cashFlowData ? (
          <p className="py-6 text-center text-sm text-surface-500">Grafik belum tersedia.</p>
        ) : (
          <DeferredCashFlowChart
            incomeDaily={cashFlowData?.income.daily.map((row) => ({ ...row, count: 0 }))}
            expenseDaily={cashFlowData?.expense.daily.map((row) => ({ ...row, byCategory: {} }))}
            loading={summaryLoading}
          />
        )}
      </section>

      {/* ───────── Two Columns: Pemasukan + Pengeluaran ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* ─── Pemasukan column ─── */}
        <section className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
          <header className="px-3 sm:px-4 py-2 sm:py-3 border-b border-surface-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-5 rounded-full shrink-0" style={{ backgroundColor: FLOW_COLOR_INCOME }} />
              <h2 className="text-sm font-semibold text-surface-900 truncate">Pemasukan</h2>
            </div>
            {incomeData && (
              <span className="text-xs text-surface-500 shrink-0">
                {incomeData.transactionCount} trx
              </span>
            )}
          </header>
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-surface-100">
            {canReadIncome && pemasukan.isLoading ? (
              <div className="h-8 w-44 rounded-md bg-surface-100 animate-pulse" />
            ) : (
              <p className="text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums break-words">
                {!canReadIncome ? "Tidak memiliki akses pemasukan" : incomeData ? formatRupiahPrecise(incomeData.monthlyTotal) : "Pemasukan belum tersedia"}
              </p>
            )}
          </div>
          {!canReadIncome || (!pemasukan.isLoading && !incomeData) ? null : pemasukan.isLoading ? (
            <div className="divide-y divide-surface-100">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-surface-50 animate-pulse" />
              ))}
            </div>
          ) : !incomeData || incomeData.daily.length === 0 ? (
            <div className="px-3 sm:px-4 py-10 text-center text-sm text-surface-500">
              Belum ada pemasukan bulan ini
            </div>
          ) : (
              <ul className="divide-y divide-surface-100 max-h-72 sm:max-h-80 overflow-y-auto">
              {incomeData.daily.map((row) => (
                <li
                  key={row.date}
                  style={{
                    contentVisibility: "auto",
                    containIntrinsicSize: "44px",
                  }}
                >
                  <IncomeDayRow date={row.date} label={fullDay(row.date)} total={row.total} count={row.count} manualCount={row.manualCount ?? 0} canOpenHistory={canOpenIncomeHistory} />
                </li>
              ))}
            </ul>
          )}
          <div id="manual-income"><ManualIncomePanel key={month} month={month} /></div>
        </section>

        {/* ─── Pengeluaran column ─── */}
        {!canReadExpense ? (
          <section className="rounded-2xl border border-surface-200 bg-white p-4 text-sm text-surface-500">Tidak memiliki akses pengeluaran</section>
        ) : <section className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
          <header className="px-3 sm:px-4 py-2 sm:py-3 border-b border-surface-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-5 rounded-full shrink-0" style={{ backgroundColor: FLOW_COLOR_EXPENSE }} />
              <h2 className="text-sm font-semibold text-surface-900 truncate">Pengeluaran</h2>
            </div>
            {expenseData && (
              <span className="text-xs text-surface-500 shrink-0">
                {expenseData.entryCount} entri
              </span>
            )}
          </header>
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-surface-100 space-y-2">
            {canCreateTransfer && <Button type="button" size="sm" onClick={openCreateTransfer}>Tambah Belanja Transfer</Button>}
            {pengeluaran.isLoading ? (
              <div className="h-8 w-44 rounded-md bg-surface-100 animate-pulse" />
            ) : (
              <p className="text-xl sm:text-2xl font-bold text-red-600 tabular-nums break-words">
                {expenseData ? formatRupiah(expenseData.monthlyTotal) : "Pengeluaran belum tersedia"}
              </p>
            )}

            {/* Differentiation anchor — category color stripe */}
            {stripeData.length > 0 && (
              <>
                <div className="flex h-3 sm:h-2.5 rounded-full overflow-hidden border border-surface-200">
                  {stripeData.map((c) => (
                    <button
                      key={c.category}
                      type="button"
                      onClick={() => {
                        setFilterCategory((cur) => (cur === c.category ? null : c.category));
                        setPage(1);
                      }}
                      title={`${expenseCategoryLabel(c.category, customCategories)} — ${formatRupiah(c.total)}`}
                      style={{
                        width: `${c.pct}%`,
                        minWidth: c.pct > 0 ? "10px" : 0,
                        backgroundColor: expenseCategoryColor(c.category),
                        opacity: filterCategory === null || filterCategory === c.category ? 1 : 0.3,
                      }}
                      className="transition-opacity cursor-pointer hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                      aria-label={`Filter ${expenseCategoryLabel(c.category, customCategories)}`}
                      aria-pressed={filterCategory === c.category}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-surface-600">
                  {stripeData.map((c) => (
                    <span key={c.category} className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: expenseCategoryColor(c.category) }} />
                      {expenseCategoryLabel(c.category, customCategories)} · {c.pct.toFixed(0)}%
                    </span>
                  ))}
                  {filterCategory && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterCategory(null);
                        setPage(1);
                      }}
                      className="text-brand-700 hover:text-brand-800 font-semibold cursor-pointer focus:outline-none focus-visible:underline"
                    >
                      Hapus filter
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="px-3 sm:px-4 py-3 border-b border-surface-100">
            <label htmlFor="expense-category-filter" className="block text-xs font-medium text-surface-700 mb-1">
              Filter kategori
            </label>
            <select
              id="expense-category-filter"
              value={filterCategory ?? ""}
              onChange={(event) => {
                setFilterCategory((event.target.value || null) as ExpenseCategoryKey | null);
                setPage(1);
              }}
              className="min-h-12 w-full sm:max-w-xs rounded-lg border border-surface-300 bg-white px-3 text-base sm:text-sm text-surface-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              <option value="">Semua kategori</option>
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS_ID[category]}
                </option>
              ))}
              {customCategories.map((category) => (
                <option key={category.id} value={customExpenseCategoryKey(category.id)}>{category.name}</option>
              ))}
            </select>
            {categoryQuery.isError && <p role="alert" className="mt-1 text-xs text-red-700">Kategori khusus belum dapat dimuat. <button type="button" onClick={() => void categoryQuery.refetch()} className="underline">Coba lagi</button></p>}
          </div>

          {list.isLoading ? (
            <div className="divide-y divide-surface-100">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-surface-50 animate-pulse" />
              ))}
            </div>
          ) : list.isError || !list.data ? (
            <div className="px-3 sm:px-4 py-10 text-center text-sm text-surface-500">Daftar pengeluaran belum tersedia</div>
          ) : list.data.data.length === 0 ? (
            <div className="px-3 sm:px-4 py-10 text-center text-sm text-surface-500">
              {filterCategory
                ? `Belum ada pengeluaran ${expenseCategoryLabel(filterCategory, customCategories)}`
                : "Belum ada pengeluaran bulan ini"}
            </div>
          ) : (
            <>
            <ul className="divide-y divide-surface-100 max-h-72 sm:max-h-80 overflow-y-auto">
                {list.data.data.map((item) => {
                  const isAutomaticExpense =
                    item.source.type !== "MANUAL" && item.source.type !== "MANUAL_TRANSFER_PURCHASE";
                  const sourceLabel =
                    item.source.type === "GOODS_PURCHASE"
                      ? "Pembelian Barang"
                      : item.source.type === "BACKDATED_PURCHASE"
                        ? "Belanja Terdahulu"
                      : item.source.type === "SHOPPING_REQUEST"
                        ? "Daftar Belanja (Legacy)"
                        : item.source.type === "MANUAL_TRANSFER_PURCHASE"
                          ? "Belanja Transfer Manual"
                          : "Manual";
                  return (
                  <li
                    key={item.id}
                    style={{
                      contentVisibility: "auto",
                      containIntrinsicSize: "72px",
                    }}
                    className={`px-3 sm:px-4 py-2.5 flex items-start sm:items-center gap-3 ${
                      isAutomaticExpense ? "bg-violet-50/50" : "bg-white"
                    }`}
                  >
                    <span
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{
                        backgroundColor: isAutomaticExpense
                          ? "#7C3AED"
                          : expenseCategoryColor(item.category),
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-surface-900 truncate max-w-full">
                          {item.applicantName}
                        </span>
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            backgroundColor: `${expenseCategoryColor(item.category)}20`,
                            color: expenseCategoryColor(item.category),
                          }}
                        >
                          {expenseCategoryLabel(item.category, customCategories)}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                            isAutomaticExpense
                              ? "border-violet-200 bg-violet-100 text-violet-800"
                              : "border-surface-200 bg-surface-100 text-surface-600"
                          }`}
                        >
                          {sourceLabel}
                        </span>
                        {item.hasMissingCostSnapshot && (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            Harga modal tidak tersedia saat approval
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-surface-500 mt-0.5 break-words sm:truncate">
                        {fullDayShort(item.occurredAt)} ·{" "}
                        {item.description || "Tanpa keterangan"}
                      </p>
                      {/* Mobile-only amount under description to avoid horizontal squeeze */}
                      <div className="sm:hidden mt-1 flex flex-row items-center gap-2">
                        <div>
                          <p className="text-sm font-semibold text-red-600 tabular-nums">
                            {formatRupiah(item.netAmount)}
                            {item.changeAmount > 0 && (
                              <span className="ml-2 text-[10px] text-surface-500 font-normal">
                                kembali {formatRupiah(item.changeAmount)}
                              </span>
                            )}
                          </p>
                        </div>
                        {item.attachmentUrl && (() => {
                          const resolvedUrl = item.attachmentUrl.includes("prnt.sc") ? `/api/prntsc?url=${encodeURIComponent(item.attachmentUrl)}` : item.attachmentUrl;
                          return (
                            <HoverImage
                              src={resolvedUrl}
                              alt="Lampiran"
                              className="w-8 h-8 ml-auto border border-surface-200 bg-surface-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedImageUrl(resolvedUrl);
                              }}
                            />
                          );
                        })()}
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-red-600 tabular-nums">
                          {formatRupiah(item.netAmount)}
                        </p>
                        {item.changeAmount > 0 && (
                          <p className="text-[10px] text-surface-500 tabular-nums">
                            kembali {formatRupiah(item.changeAmount)}
                          </p>
                        )}
                      </div>
                      {item.attachmentUrl && (() => {
                        const resolvedUrl = item.attachmentUrl.includes("prnt.sc") ? `/api/prntsc?url=${encodeURIComponent(item.attachmentUrl)}` : item.attachmentUrl;
                        return (
                          <HoverImage
                            src={resolvedUrl}
                            alt="Lampiran"
                            className="w-10 h-10 border border-surface-200 bg-surface-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedImageUrl(resolvedUrl);
                            }}
                          />
                        );
                      })()}
                    </div>
                    {((item.source.type === "MANUAL_TRANSFER_PURCHASE" ? canEditTransfer || canDeleteTransfer : canEdit || canDelete)) && !isAutomaticExpense && (
                      <RowActions
                        canEdit={item.source.type === "MANUAL_TRANSFER_PURCHASE" ? canEditTransfer : canEdit}
                        canDelete={item.source.type === "MANUAL_TRANSFER_PURCHASE" ? canDeleteTransfer : canDelete}
                        onEdit={() => handleEdit(item)}
                        onDelete={() => handleDelete(item)}
                      />
                    )}
                  </li>
                  );
                })}
              </ul>

              {list.data.pagination.totalPages > 1 && (
                <footer className="px-3 sm:px-4 py-2 border-t border-surface-100 flex items-center justify-between gap-2">
                  <span className="text-xs text-surface-500">
                    Hal. {list.data.pagination.page} dari {list.data.pagination.totalPages}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={!list.data.pagination.hasPreviousPage}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="min-h-9 px-3 py-1 text-xs font-medium rounded-lg border border-surface-200 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                    >
                      Sebelumnya
                    </button>
                    <button
                      type="button"
                      disabled={!list.data.pagination.hasNextPage}
                      onClick={() => setPage((p) => p + 1)}
                      className="min-h-9 px-3 py-1 text-xs font-medium rounded-lg border border-surface-200 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                    >
                      Berikutnya
                    </button>
                  </div>
                </footer>
              )}
            </>
          )}
        </section>}
      </div>

      {modalOpen && (
        <ExpenseFormModal
          open
          onClose={() => setModalOpen(false)}
          onSaved={refresh}
          initial={editing}
          mode={modalMode}
          canCreateCategory={canCreate}
        />
      )}
      {transferModal && <ManualFinanceFormModal key={transferModal.initial?.id ?? 'transfer-create'} open kind="transfer" initial={transferModal.initial} onClose={() => setTransferModal(null)} onSaved={() => { void refresh(); }} />}

      {selectedImageUrl && (
        <Modal
          open={!!selectedImageUrl}
          onClose={() => setSelectedImageUrl(null)}
          title="Lampiran Pengeluaran"
          size="2xl"
        >
          <div className="flex justify-center items-center py-4 bg-surface-50 rounded-xl">
            <img
              src={selectedImageUrl}
              alt="Preview Lampiran"
              className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <div className="flex justify-end mt-4">
            <a
              href={selectedImageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-xl transition-colors"
            >
              Buka di Tab Baru
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RowActions({
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Position the menu against the trigger using viewport coordinates.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;

    const MENU_W = 156;
    const MENU_H = 88;
    const GAP = 4;

    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = rect.right - MENU_W;
      let top = rect.bottom + GAP;
      if (left < 8) left = 8;
      if (left + MENU_W > vw - 8) left = vw - 8 - MENU_W;
      if (top + MENU_H > vh - 8) {
        top = Math.max(8, rect.top - GAP - MENU_H);
      }
      setMenuPos({ top, left });
    };

    place();
    const onResize = () => place();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0 self-start sm:self-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="min-h-9 min-w-9 inline-flex items-center justify-center p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        aria-label="Aksi"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && mounted && menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left, width: 156 }}
            className="fixed z-50 bg-white border border-surface-200 rounded-xl shadow-lg py-1"
          >
            {canEdit && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
                className="w-full text-left px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 cursor-pointer focus:outline-none focus:bg-surface-50"
              >
                Ubah
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer focus:outline-none focus:bg-red-50"
              >
                Hapus
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

function HoverImage({ src, alt, onClick, className }: { src: string; alt: string; onClick: (e: React.MouseEvent) => void; className?: string }) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const ref = useRef<HTMLImageElement>(null);

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.top + rect.height / 2, right: window.innerWidth - rect.left });
    }
    setHovered(true);
  };

  return (
    <div className={`relative shrink-0 ${className || ''} rounded-md relative z-10`} onMouseLeave={() => setHovered(false)}>
      <img
        ref={ref}
        src={src}
        alt={alt}
        className="w-full h-full object-cover cursor-pointer hover:ring-2 hover:ring-brand-500 rounded-md transition-all"
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      {hovered && createPortal(
        <div 
          className="fixed z-[100] pointer-events-none flex items-center"
          style={{ top: pos.top, right: pos.right + 12, transform: 'translateY(-50%)' }}
        >
          <div className="bg-white p-1.5 rounded-xl shadow-2xl border border-surface-200 flex animate-in fade-in duration-200">
            <img src={src} alt="Preview Lampiran" className="w-auto max-w-[200px] sm:max-w-[300px] h-auto max-h-[300px] sm:max-h-[420px] object-contain rounded-lg shadow-sm" />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

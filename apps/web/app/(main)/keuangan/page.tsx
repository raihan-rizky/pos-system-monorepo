"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Button } from "@pos/ui";
import { ChevronRight, MoreVertical, Plus } from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import {
  useIncomeSummary,
  useExpenseSummary,
  useExpenseList,
  type ExpenseListItem,
} from "@/features/keuangan/hooks/useKeuangan";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "@/features/keuangan/helpers/keuangan-core";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS_ID,
} from "@/features/keuangan/helpers/category-meta";
import {
  ExpenseFormModal,
  type ExpenseFormInitial,
} from "@/features/keuangan/components/ExpenseFormModal";
import { formatRupiah } from "@/lib/utils";

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

function shortDay(date: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit" }).format(
    new Date(`${date}T00:00:00+07:00`),
  );
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
  const { canPerform } = useRole();
  const canCreate = canPerform("expense", "create");
  const canEdit = canPerform("expense", "update");
  const canDelete = canPerform("expense", "delete");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<ExpenseFormInitial | undefined>();
  const [page, setPage] = useState(1);
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | null>(null);

  const pemasukan = useIncomeSummary(month);
  const pengeluaran = useExpenseSummary(month);
  const list = useExpenseList(month, page, filterCategory);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["finance"] });

  const handleEdit = (item: ExpenseListItem) => {
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
  };

  const handleDelete = async (item: ExpenseListItem) => {
    if (!confirm(`Hapus pengeluaran ${item.applicantName}?`)) return;
    const res = await fetch(`/api/finance/expenses/${item.id}`, { method: "DELETE" });
    if (res.ok) refresh();
    else alert("Gagal menghapus");
  };

  // Bidirectional flow data: income positive, expense negative (drawn below zero line)
  const flowData = useMemo(() => {
    const map = new Map<string, { date: string; income: number; expense: number }>();
    pemasukan.data?.daily.forEach((d) => {
      map.set(d.date, { date: d.date, income: d.total, expense: 0 });
    });
    pengeluaran.data?.daily.forEach((d) => {
      const existing = map.get(d.date) ?? { date: d.date, income: 0, expense: 0 };
      existing.expense = -d.total; // negative for below-axis rendering
      map.set(d.date, existing);
    });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [pemasukan.data, pengeluaran.data]);

  const stripeData = useMemo(() => {
    if (!pengeluaran.data || pengeluaran.data.byCategory.length === 0) return [];
    const total = pengeluaran.data.byCategory.reduce((s, c) => s + c.total, 0);
    return pengeluaran.data.byCategory.map((c) => ({
      ...c,
      pct: total > 0 ? (c.total / total) * 100 : 0,
    }));
  }, [pengeluaran.data]);

  const net = pengeluaran.data?.netCashFlow.net ?? 0;
  const isNegative = net < 0;
  const summaryLoading = pemasukan.isLoading || pengeluaran.isLoading;

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
                {formatRupiah(net)}
              </p>
            )}
            {!summaryLoading && (
              <p className="mt-1.5 text-[11px] sm:text-xs text-surface-500 tabular-nums">
                <span className="block sm:inline">
                  {formatRupiah(pengeluaran.data?.netCashFlow.income ?? 0)} pemasukan
                </span>
                <span className="hidden sm:inline"> · </span>
                <span className="block sm:inline">
                  {formatRupiah(pengeluaran.data?.netCashFlow.expense ?? 0)} pengeluaran
                </span>
              </p>
            )}
          </div>
          {canCreate && (
            <Button
              onClick={() => {
                setEditing(undefined);
                setModalMode("create");
                setModalOpen(true);
              }}
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
        <div className="h-48 sm:h-56 md:h-64">
          {summaryLoading ? (
            <div className="h-full w-full rounded-xl bg-surface-100 animate-pulse" />
          ) : flowData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={flowData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  tickFormatter={shortDay}
                  axisLine={{ stroke: "#CBD5E1" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  tickFormatter={(v) => {
                    const abs = Math.abs(v);
                    return abs >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}jt` : abs >= 1000 ? `${(v / 1000).toFixed(0)}rb` : String(v);
                  }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  cursor={{ fill: "#F1F5F9" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }}
                  formatter={(v, name) => [formatRupiah(Math.abs(Number(v ?? 0))), name === "income" ? "Pemasukan" : "Pengeluaran"]}
                  labelFormatter={(d) => fullDay(d as string)}
                />
                <ReferenceLine y={0} stroke="#0F172A" strokeWidth={1.5} />
                <Bar dataKey="income" fill={FLOW_COLOR_INCOME} radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill={FLOW_COLOR_EXPENSE} radius={[0, 0, 4, 4]} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-surface-500">
              Belum ada aktivitas bulan ini
            </div>
          )}
        </div>
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
            {pemasukan.data && (
              <span className="text-xs text-surface-500 shrink-0">
                {pemasukan.data.transactionCount} trx
              </span>
            )}
          </header>
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-surface-100">
            {pemasukan.isLoading ? (
              <div className="h-8 w-44 rounded-md bg-surface-100 animate-pulse" />
            ) : (
              <p className="text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums break-words">
                {formatRupiah(pemasukan.data?.monthlyTotal ?? 0)}
              </p>
            )}
          </div>
          {pemasukan.isLoading ? (
            <div className="divide-y divide-surface-100">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-surface-50 animate-pulse" />
              ))}
            </div>
          ) : !pemasukan.data || pemasukan.data.daily.length === 0 ? (
            <div className="px-3 sm:px-4 py-10 text-center text-sm text-surface-500">
              Belum ada pemasukan bulan ini
            </div>
          ) : (
              <ul className="divide-y divide-surface-100 max-h-72 sm:max-h-80 overflow-y-auto">
              {pemasukan.data.daily.map((row) => (
                <li key={row.date}>
                  <Link
                    href={`/history?date=${row.date}`}
                    className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 min-h-11 hover:bg-surface-50 transition-colors cursor-pointer group focus:outline-none focus-visible:bg-surface-50"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-surface-900 truncate">
                        {fullDay(row.date)}
                      </span>
                      <span className="text-xs text-surface-500">{row.count} transaksi</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-emerald-700 tabular-nums">
                        {formatRupiah(row.total)}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-surface-300 transition-colors group-hover:text-emerald-600" aria-hidden="true" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ─── Pengeluaran column ─── */}
        <section className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
          <header className="px-3 sm:px-4 py-2 sm:py-3 border-b border-surface-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-5 rounded-full shrink-0" style={{ backgroundColor: FLOW_COLOR_EXPENSE }} />
              <h2 className="text-sm font-semibold text-surface-900 truncate">Pengeluaran</h2>
            </div>
            {pengeluaran.data && (
              <span className="text-xs text-surface-500 shrink-0">
                {pengeluaran.data.entryCount} entri
              </span>
            )}
          </header>
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-surface-100 space-y-2">
            {pengeluaran.isLoading ? (
              <div className="h-8 w-44 rounded-md bg-surface-100 animate-pulse" />
            ) : (
              <p className="text-xl sm:text-2xl font-bold text-red-600 tabular-nums break-words">
                {formatRupiah(pengeluaran.data?.monthlyTotal ?? 0)}
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
                      onClick={() =>
                        setFilterCategory((cur) => (cur === c.category ? null : c.category))
                      }
                      title={`${CATEGORY_LABELS_ID[c.category]} — ${formatRupiah(c.total)}`}
                      style={{
                        width: `${c.pct}%`,
                        minWidth: c.pct > 0 ? "10px" : 0,
                        backgroundColor: CATEGORY_COLORS[c.category],
                        opacity: filterCategory === null || filterCategory === c.category ? 1 : 0.3,
                      }}
                      className="transition-opacity cursor-pointer hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                      aria-label={`Filter ${CATEGORY_LABELS_ID[c.category]}`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-surface-600">
                  {stripeData.map((c) => (
                    <span key={c.category} className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c.category] }} />
                      {CATEGORY_LABELS_ID[c.category]} · {c.pct.toFixed(0)}%
                    </span>
                  ))}
                  {filterCategory && (
                    <button
                      type="button"
                      onClick={() => setFilterCategory(null)}
                      className="text-brand-700 hover:text-brand-800 font-semibold cursor-pointer focus:outline-none focus-visible:underline"
                    >
                      Hapus filter
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {list.isLoading ? (
            <div className="divide-y divide-surface-100">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-surface-50 animate-pulse" />
              ))}
            </div>
          ) : !list.data || list.data.data.length === 0 ? (
            <div className="px-3 sm:px-4 py-10 text-center text-sm text-surface-500">
              {filterCategory
                ? `Belum ada pengeluaran ${CATEGORY_LABELS_ID[filterCategory]}`
                : "Belum ada pengeluaran bulan ini"}
            </div>
          ) : (
            <>
            <ul className="divide-y divide-surface-100 max-h-72 sm:max-h-80 overflow-y-auto">
                {list.data.data.map((item) => (
                  <li key={item.id} className="px-3 sm:px-4 py-2.5 flex items-start sm:items-center gap-3">
                    <span
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[item.category] }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-surface-900 truncate max-w-full">
                          {item.applicantName}
                        </span>
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            backgroundColor: `${CATEGORY_COLORS[item.category]}20`,
                            color: CATEGORY_COLORS[item.category],
                          }}
                        >
                          {CATEGORY_LABELS_ID[item.category]}
                        </span>
                      </div>
                      <p className="text-xs text-surface-500 mt-0.5 break-words sm:truncate">
                        {fullDayShort(item.occurredAt)} ·{" "}
                        {item.description || "Tanpa keterangan"}
                      </p>
                      {/* Mobile-only amount under description to avoid horizontal squeeze */}
                      <p className="sm:hidden mt-1 text-sm font-semibold text-red-600 tabular-nums">
                        {formatRupiah(item.netAmount)}
                        {item.changeAmount > 0 && (
                          <span className="ml-2 text-[10px] text-surface-500 font-normal">
                            kembali {formatRupiah(item.changeAmount)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="hidden sm:block text-right shrink-0">
                      <p className="text-sm font-semibold text-red-600 tabular-nums">
                        {formatRupiah(item.netAmount)}
                      </p>
                      {item.changeAmount > 0 && (
                        <p className="text-[10px] text-surface-500 tabular-nums">
                          kembali {formatRupiah(item.changeAmount)}
                        </p>
                      )}
                    </div>
                    {(canEdit || canDelete) && (
                      <RowActions
                        canEdit={canEdit}
                        canDelete={canDelete}
                        onEdit={() => handleEdit(item)}
                        onDelete={() => handleDelete(item)}
                      />
                    )}
                  </li>
                ))}
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
        </section>
      </div>

      <ExpenseFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={refresh}
        initial={editing}
        mode={modalMode}
      />
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

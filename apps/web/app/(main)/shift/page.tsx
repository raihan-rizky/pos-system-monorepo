"use client";

import React, { useState, useCallback } from "react";
import {
  useShiftHistory,
  useActiveShift,
  useShiftSummary,
  useCloseShiftSummary,
  CashierShift,
} from "@/hooks/useShift";
import { formatRupiah, formatDate } from "@/lib/utils";
import { useRole } from "@/components/providers/RoleProvider";
import { EditShiftModal } from "@/components/EditShiftModal";
import { OpenShiftModal } from "@/components/OpenShiftModal";
import { CloseShiftModal } from "@/components/CloseShiftModal";
import { StatTile } from "@/features/dashboard/components/StatTile";
import { SectionCard } from "@/features/dashboard/components/SectionCard";
import { shouldShowUpdateAction } from "@/features/rbac/helpers/rbac-ui";
import {
  Wallet,
  Clock,
  TrendingUp,
  Receipt,
  Edit2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from "lucide-react";

// ─── Sort types ──────────────────────────────────────────────────────────────
type SortField =
  | "openedAt"
  | "closedAt"
  | "openingBalance"
  | "closingBalance"
  | "expectedBalance"
  | "discrepancy";

// ─── Active Shift Dashboard ──────────────────────────────────────────────────
function ActiveShiftPanel({
  shift,
  onCloseShift,
}: {
  shift: CashierShift;
  onCloseShift: () => void;
}) {
  const { data: summary } = useCloseShiftSummary(shift.id, !shift.isLocalOnly);
  const totalCash = summary?.totalCashTransactions ?? null;
  const expectedBalance = summary?.expectedBalance ?? null;
  const uptime = useUptime(shift.openedAt);

  return (
    <SectionCard
      title={shift.isLocalOnly ? "Shift Offline Aktif" : "Shift Aktif"}
      subtitle={`Kasir: ${shift.cashier?.name || "—"}`}
      accent="brand"
      icon={<Wallet className="h-4 w-4" />}
      action={
        <button
          onClick={onCloseShift}
          className="cursor-pointer rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 transition-colors duration-200 hover:bg-red-100"
        >
          TUTUP SHIFT
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Modal Laci"
          value={formatRupiah(shift.openingBalance)}
          tone="brand"
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatTile
          label="Transaksi Cash"
          value={totalCash !== null ? formatRupiah(totalCash) : "—"}
          tone="neutral"
          icon={<Receipt className="h-4 w-4" />}
        />
        <StatTile
          label="Estimasi Laci"
          value={expectedBalance !== null ? formatRupiah(expectedBalance) : "—"}
          tone="success"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatTile
          label="Durasi"
          value={uptime}
          tone="warning"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>
    </SectionCard>
  );
}

function useUptime(openedAt: string): string {
  const [uptime, setUptime] = useState<string>("");

  React.useEffect(() => {
    const update = () => {
      const start = new Date(openedAt);
      if (Number.isNaN(start.getTime())) {
        setUptime("—");
        return;
      }
      const diffMin = Math.floor((Date.now() - start.getTime()) / 60000);
      if (diffMin < 60) {
        setUptime(`${diffMin} mnt`);
      } else {
        const hrs = Math.floor(diffMin / 60);
        const mins = diffMin % 60;
        setUptime(`${hrs}j ${mins}m`);
      }
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [openedAt]);

  return uptime;
}

function NoActiveShiftPanel({ onOpenShift }: { onOpenShift: () => void }) {
  return (
    <SectionCard
      title="Belum Ada Shift Aktif"
      subtitle="Buka shift baru untuk memulai transaksi"
      accent="warning"
      icon={<Wallet className="h-4 w-4" />}
      action={
        <button
          onClick={onOpenShift}
          className="cursor-pointer rounded-xl bg-brand-600 px-4 py-1.5 text-xs font-bold text-white transition-colors duration-200 hover:bg-brand-700"
        >
          BUKA SHIFT BARU
        </button>
      }
    >
      <div className="flex items-center justify-center py-6 text-surface-400">
        <Wallet className="h-10 w-10 opacity-30" />
      </div>
    </SectionCard>
  );
}

// ─── Summary Stats ───────────────────────────────────────────────────────────
function ShiftSummaryRow() {
  const { data, isLoading } = useShiftSummary();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatTile
        label="Total Shift"
        value={isLoading ? "…" : String(data?.totalShifts ?? 0)}
        hint={
          data
            ? `${data.openShifts} aktif · ${data.totalShifts - data.openShifts} selesai`
            : undefined
        }
        tone="neutral"
        icon={<Receipt className="h-4 w-4" />}
        loading={isLoading}
      />
      <StatTile
        label="Total Selisih"
        value={
          isLoading
            ? "…"
            : data
              ? `${data.totalDiscrepancy > 0 ? "+" : ""}${formatRupiah(data.totalDiscrepancy)}`
              : "—"
        }
        hint={
          !isLoading && data
            ? data.totalDiscrepancy === 0
              ? "Sempurna"
              : data.totalDiscrepancy < 0
                ? "Kas kurang"
                : "Kas lebih"
            : undefined
        }
        tone={
          !isLoading && data
            ? data.totalDiscrepancy === 0
              ? "success"
              : data.totalDiscrepancy < 0
                ? "danger"
                : "warning"
            : "neutral"
        }
        icon={<AlertTriangle className="h-4 w-4" />}
        loading={isLoading}
      />
      <StatTile
        label="Rata-rata Durasi"
        value={isLoading ? "…" : formatDuration(data?.avgDurationMinutes ?? null)}
        tone="brand"
        icon={<Clock className="h-4 w-4" />}
        loading={isLoading}
      />
    </div>
  );
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} mnt`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}j ${mins}m`;
}

// ─── Sortable Table ──────────────────────────────────────────────────────────
interface ColumnDef {
  field: SortField;
  label: string;
  sortable: boolean;
  align?: "left" | "right" | "center";
}

const COLUMNS: ColumnDef[] = [
  { field: "openedAt", label: "Waktu Mulai", sortable: true },
  { field: "closedAt", label: "Waktu Selesai", sortable: true },
  { field: "openingBalance", label: "Modal Laci", sortable: true, align: "right" },
  { field: "expectedBalance", label: "Ekspetasi Tutup Laci", sortable: true, align: "right" },
  { field: "closingBalance", label: "Tutup Laci", sortable: true, align: "right" },
  { field: "discrepancy", label: "Selisih", sortable: true, align: "right" },
  { field: "openedAt", label: "Kasir", sortable: false },
  { field: "openedAt", label: "Catatan", sortable: false },
  { field: "openedAt", label: "Status", sortable: false, align: "center" },
];

function SortIcon({
  field,
  sortBy,
  sortOrder,
}: {
  field: SortField;
  sortBy: SortField;
  sortOrder: "asc" | "desc";
}) {
  if (field !== sortBy)
    return <ArrowUpDown className="h-3 w-3 opacity-30" aria-hidden="true" />;
  return sortOrder === "asc" ? (
    <ArrowUp className="h-3 w-3 text-brand-600" aria-hidden="true" />
  ) : (
    <ArrowDown className="h-3 w-3 text-brand-600" aria-hidden="true" />
  );
}

function DiscrepancyBadge({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-success-600 font-extrabold">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {formatRupiah(value)}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-danger-600 font-extrabold">
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
        {formatRupiah(value)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-amber-600 font-extrabold">
      <MinusCircle className="h-3.5 w-3.5" aria-hidden="true" />
      +{formatRupiah(value)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isOpen = status === "OPEN";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
        isOpen
          ? "bg-brand-50 text-brand-700 border border-brand-200"
          : "bg-surface-100 text-surface-600 border border-surface-200"
      }`}
    >
      {isOpen && (
        <span
          className="relative flex h-1.5 w-1.5"
          aria-hidden="true"
        >
          <span className="absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
        </span>
      )}
      {status}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ShiftHistoryPage() {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortField>("openedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const { data: result, isLoading } = useShiftHistory(page, 10, sortBy, sortOrder);
  const { data: activeShift } = useActiveShift();
  const { canPerform } = useRole();
  const canUpdateShifts = shouldShowUpdateAction("shift", canPerform);

  const [editOpen, setEditOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<CashierShift | null>(null);
  const [openShiftModalOpen, setOpenShiftModalOpen] = useState(false);
  const [closeShiftModalOpen, setCloseShiftModalOpen] = useState(false);

  const shifts = result?.data ?? [];
  const total = result?.pagination.total ?? 0;
  const totalPages = result?.pagination.totalPages ?? 1;
  const startItem = total === 0 ? 0 : (page - 1) * 10 + 1;
  const endItem = Math.min(page * 10, total);

  const handleSortClick = useCallback((field: SortField) => {
    setSortBy((prev) => {
      if (prev === field) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(field);
        setSortOrder("desc");
      }
      return field;
    });
    setPage(1);
  }, []);

  const handleEditShift = useCallback((shift: CashierShift) => {
    setSelectedShift(shift);
    setEditOpen(true);
  }, []);

  return (
    <>
      <main className="flex-1 overflow-y-auto bg-surface-50/40">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-surface-100 bg-white/85 backdrop-blur-md">
          <div className="px-4 py-4 md:px-8 md:py-5 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-extrabold text-surface-900">
                Riwayat Shift Kasir
              </h1>
              <p className="mt-1 text-sm text-surface-500">
                Daftar rekapan sesi kasir dan selisih kas laci uang
              </p>
            </div>
            {activeShift && (
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-brand-100 bg-brand-50/70 px-3 py-1 text-[11px] font-semibold text-brand-700 md:self-auto">
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
                </span>
                Shift Aktif
              </div>
            )}
          </div>
        </header>

        <div className="space-y-5 px-4 py-6 md:px-8">
          {/* Active shift panel */}
          {activeShift ? (
            <ActiveShiftPanel
              shift={activeShift}
              onCloseShift={() => setCloseShiftModalOpen(true)}
            />
          ) : (
            <NoActiveShiftPanel onOpenShift={() => setOpenShiftModalOpen(true)} />
          )}

          {/* Summary stats */}
          <ShiftSummaryRow />

          {/* History table */}
          <SectionCard
            title="Riwayat Shift"
            subtitle={`${total} shift tercatat`}
            accent="brand"
            icon={<Receipt className="h-4 w-4" />}
            bodyClassName="px-0 py-0"
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-surface-400 font-medium">
                Memuat data shift…
              </div>
            ) : shifts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-surface-400">
                <Wallet className="h-10 w-10 mb-3 opacity-30" aria-hidden="true" />
                <p className="font-medium text-surface-600">Belum ada riwayat shift.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-surface-50/80 border-b border-surface-200 text-surface-600">
                        <SortableTh
                          field="openedAt"
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortClick}
                        >
                          Waktu Mulai
                        </SortableTh>
                        <SortableTh
                          field="closedAt"
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortClick}
                        >
                          Waktu Selesai
                        </SortableTh>
                        <SortableTh
                          field="openingBalance"
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortClick}
                          align="right"
                        >
                          Modal Laci
                        </SortableTh>
                        <SortableTh
                          field="expectedBalance"
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortClick}
                          align="right"
                        >
                          Ekspetasi Tutup Laci
                        </SortableTh>
                        <SortableTh
                          field="closingBalance"
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortClick}
                          align="right"
                        >
                          Tutup Laci
                        </SortableTh>
                        <SortableTh
                          field="discrepancy"
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortClick}
                          align="right"
                        >
                          Selisih
                        </SortableTh>
                        <th className="py-3.5 px-5 font-semibold text-surface-600">
                          Kasir
                        </th>
                        <th className="py-3.5 px-5 font-semibold text-surface-600">
                          Catatan
                        </th>
                        <th className="py-3.5 px-5 font-semibold text-center text-surface-600">
                          Status
                        </th>
                        {canUpdateShifts && (
                          <th className="py-3.5 px-5 font-semibold text-center text-surface-600">
                            Aksi
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {shifts.map((shift) => (
                        <tr
                          key={shift.id}
                          className="hover:bg-surface-50/60 transition-colors duration-150"
                        >
                          <td className="py-3.5 px-5 text-surface-900 tabular-nums whitespace-nowrap">
                            {formatDate(shift.openedAt)}
                          </td>
                          <td className="py-3.5 px-5 text-surface-500 tabular-nums whitespace-nowrap">
                            {shift.closedAt ? formatDate(shift.closedAt) : "—"}
                          </td>
                          <td className="py-3.5 px-5 text-right font-bold text-surface-900 tabular-nums">
                            {formatRupiah(shift.openingBalance)}
                          </td>
                          <td className="py-3.5 px-5 text-right font-bold text-surface-700 tabular-nums">
                            {shift.expectedBalance != null
                              ? formatRupiah(shift.expectedBalance)
                              : "—"}
                          </td>
                          <td className="py-3.5 px-5 text-right font-bold text-surface-900 tabular-nums">
                            {shift.closingBalance != null
                              ? formatRupiah(shift.closingBalance)
                              : "—"}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            {shift.discrepancy != null ? (
                              <DiscrepancyBadge value={shift.discrepancy} />
                            ) : (
                              <span className="text-surface-400">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-5 font-medium text-surface-900 whitespace-nowrap">
                            {shift.cashier?.name || "Kasir"}
                          </td>
                          <td
                            className="py-3.5 px-5 text-surface-500 max-w-[140px] truncate"
                            title={shift.note || ""}
                          >
                            {shift.note || "—"}
                          </td>
                          <td className="py-3.5 px-5 text-center">
                            <StatusBadge status={shift.status} />
                          </td>
                          {canUpdateShifts && (
                            <td className="py-3.5 px-5 text-center">
                              <button
                                onClick={() => handleEditShift(shift)}
                                className="cursor-pointer rounded-lg p-2 text-surface-400 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-600"
                                title="Ubah Shift"
                                aria-label={`Ubah shift ${shift.id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between border-t border-surface-100 px-5 py-3.5">
                  <p className="text-sm text-surface-500">
                    Menampilkan{" "}
                    <span className="font-semibold text-surface-900">
                      {startItem}–{endItem}
                    </span>{" "}
                    dari{" "}
                    <span className="font-semibold text-surface-900">{total}</span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="cursor-pointer rounded-xl border border-surface-200 px-3 py-2 text-sm font-medium transition-colors duration-200 hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Sebelumnya
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="cursor-pointer rounded-xl border border-surface-200 px-3 py-2 text-sm font-medium transition-colors duration-200 hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              </>
            )}
          </SectionCard>
        </div>
      </main>

      {/* Modals */}
      <EditShiftModal
        open={editOpen && canUpdateShifts}
        onClose={() => {
          setEditOpen(false);
          setSelectedShift(null);
        }}
        shift={selectedShift}
      />
      <OpenShiftModal
        open={openShiftModalOpen}
        onClose={() => setOpenShiftModalOpen(false)}
      />
      <CloseShiftModal
        open={closeShiftModalOpen}
        onClose={() => setCloseShiftModalOpen(false)}
        shift={activeShift ?? null}
      />
    </>
  );
}

// ─── Sortable Table Header ───────────────────────────────────────────────────
function SortableTh({
  field,
  sortBy,
  sortOrder,
  onSort,
  children,
  align = "left",
}: {
  field: SortField;
  sortBy: SortField;
  sortOrder: "asc" | "desc";
  onSort: (field: SortField) => void;
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "";
  return (
    <th
      className={`py-3.5 px-5 font-semibold cursor-pointer select-none transition-colors duration-150 hover:text-surface-900 ${alignClass}`}
      onClick={() => onSort(field)}
      aria-sort={sortBy === field ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
        <SortIcon field={field} sortBy={sortBy} sortOrder={sortOrder} />
      </span>
    </th>
  );
}

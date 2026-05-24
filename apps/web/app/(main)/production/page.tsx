"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@pos/ui";
import {
  useJobOrders,
  useMoveJobOrder,
  useProductionActivity,
  useSendPickupNotification,
  ProductionStatus,
  JobOrder,
  type ProductionActivityLog,
} from "@/hooks/useJobOrders";
import KanbanBoard, { KanbanFilter } from "@/components/kanban/KanbanBoard";
import { ConfirmDeliveryModal } from "@/components/kanban/ConfirmDeliveryModal";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Kanban,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import { shouldShowUpdateAction } from "@/features/rbac/helpers/rbac-ui";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  delay?: string;
  active?: boolean;
  onClick?: () => void;
}

function StatCard({
  label,
  value,
  icon,
  color,
  delay,
  active,
  onClick,
}: StatCardProps) {
  const interactive = Boolean(onClick);
  const ringClass = active
    ? "ring-2 ring-brand-500/60 shadow-md"
    : interactive
      ? "hover:ring-1 hover:ring-surface-300 hover:shadow-md"
      : "";

  return (
    <Card
      glass
      className={`animate-fade-in transition-all ${ringClass} ${
        interactive ? "cursor-pointer" : ""
      }`}
      style={delay ? { animationDelay: delay } : undefined}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-surface-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-extrabold text-surface-900">
            {value}
          </p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}

const FILTER_OPTIONS: ReadonlyArray<{ id: KanbanFilter; label: string }> = [
  { id: "ALL", label: "Semua" },
  { id: "PRINTING", label: "Sedang Diproses" },
  { id: "READY_PICKUP", label: "Siap" },
  { id: "OVERDUE", label: "Terlambat" },
];

type ProductionPageTab = "board" | "activity";
type ActivityFilter = "ALL" | ProductionStatus;

const PAGE_TABS: ReadonlyArray<{
  id: ProductionPageTab;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "board", label: "Papan", icon: <Kanban className="h-4 w-4" /> },
  {
    id: "activity",
    label: "Aktivitas Produksi",
    icon: <Activity className="h-4 w-4" />,
  },
];

function PageTabs({
  value,
  onChange,
}: {
  value: ProductionPageTab;
  onChange: (next: ProductionPageTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Tampilan produksi"
      className="flex w-fit max-w-full items-center gap-1.5 overflow-x-auto rounded-xl border border-surface-200 bg-surface-100/80 p-1"
    >
      {PAGE_TABS.map((tab) => {
        const isActive = value === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
              isActive
                ? "bg-white text-surface-900 shadow-sm"
                : "text-surface-600 hover:text-surface-900"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterPills({
  value,
  onChange,
  overdueCount,
}: {
  value: KanbanFilter;
  onChange: (next: KanbanFilter) => void;
  overdueCount: number;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter job order"
      className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-xl border border-surface-200 bg-surface-100/80 p-1"
    >
      {FILTER_OPTIONS.map((opt) => {
        const isActive = value === opt.id;
        const showBadge = opt.id === "OVERDUE" && overdueCount > 0;
        return (
          <button
            key={opt.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(opt.id)}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
              isActive
                ? "bg-white text-surface-900 shadow-sm"
                : "text-surface-600 hover:text-surface-900"
            }`}
          >
            {opt.label}
            {showBadge ? (
              <span
                className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                  isActive ? "bg-red-100 text-red-700" : "bg-red-500 text-white"
                }`}
              >
                {overdueCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function formatRelative(from: number, to: number): string {
  const seconds = Math.max(0, Math.floor((to - from) / 1000));
  if (seconds < 5) return "baru saja";
  if (seconds < 60) return `${seconds}d lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m lalu`;
  const hours = Math.floor(minutes / 60);
  return `${hours}j lalu`;
}

function productionStatusLabel(status: ProductionStatus | null): string {
  if (status === "PRINTING") return "Printing";
  if (status === "READY_PICKUP") return "Siap";
  if (status === "DELIVERED") return "Selesai";
  return "Baru";
}

function productionStatusTone(status: ProductionStatus | null): string {
  if (status === "PRINTING") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "READY_PICKUP") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "DELIVERED") {
    return "border-surface-200 bg-surface-100 text-surface-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function isPickupWhatsappActivity(entry: ProductionActivityLog) {
  return entry.eventType === "PICKUP_WHATSAPP_SENT";
}

function formatActivityDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatActivityDayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const isSameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  if (isSameDay) return "Hari ini";

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return "Kemarin";

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function ProductionActivityFeed({
  activity,
  isLoading,
  isError,
  isFetching,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  onRefresh,
  refreshedLabel,
}: {
  activity: ProductionActivityLog[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  search: string;
  onSearchChange: (next: string) => void;
  filter: ActivityFilter;
  onFilterChange: (next: ActivityFilter) => void;
  onRefresh: () => void;
  refreshedLabel: string;
}) {
  const statusChangeActivity = activity.filter(
    (entry) => !isPickupWhatsappActivity(entry),
  );
  const latestReady = statusChangeActivity.filter(
    (entry) => entry.toStatus === "READY_PICKUP",
  ).length;
  const latestPrinting = statusChangeActivity.filter(
    (entry) => entry.toStatus === "PRINTING",
  ).length;
  const activeOperators = new Set(activity.map((entry) => entry.actorName)).size;
  const groupedActivity = activity.reduce<
    Array<{ label: string; entries: ProductionActivityLog[] }>
  >((groups, entry) => {
    const label = formatActivityDayLabel(entry.createdAt);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.entries.push(entry);
    } else {
      groups.push({ label, entries: [entry] });
    }
    return groups;
  }, []);

  return (
    <section className="space-y-4 animate-fade-in">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-surface-200 bg-white px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-surface-500">
                Aktivitas Terlihat
              </p>
              <p className="mt-2 text-2xl font-bold text-surface-900">
                {isLoading ? "..." : activity.length}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-900 text-white">
              <Activity className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
            <p className="mt-2 text-xs text-surface-500">
            Menampilkan aktivitas produksi terbaru.
          </p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                Masuk Printing
              </p>
              <p className="mt-2 text-2xl font-bold text-surface-900">
                {isLoading ? "..." : latestPrinting}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 text-xs text-blue-700/80">
            Job order yang baru masuk proses produksi.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                Siap Diambil
              </p>
              <p className="mt-2 text-2xl font-bold text-surface-900">
                {isLoading ? "..." : latestReady}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 text-xs text-emerald-700/80">
            Job order yang selesai diproses dan menunggu pelanggan.
          </p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                Operator Aktif
              </p>
              <p className="mt-2 text-2xl font-bold text-surface-900">
                {isLoading ? "..." : activeOperators}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white">
              <Users className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 text-xs text-amber-700/80">
            Nama operator yang muncul pada daftar terbaru.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-surface-200 bg-white">
        <div className="border-b border-surface-200 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-900 text-white">
                  <Activity className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-surface-900">
                    Aktivitas Produksi
                  </h2>
                  <p className="mt-1 text-sm text-surface-500">
                    Riwayat status dan notifikasi pickup job order.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <span
                aria-live="polite"
                className="inline-flex items-center gap-2 text-xs text-surface-500"
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-2 w-2 rounded-full ${
                    isFetching ? "bg-emerald-500 animate-pulse" : "bg-surface-300"
                  }`}
                />
                {refreshedLabel}
              </span>
              <button
                type="button"
                onClick={onRefresh}
                disabled={isFetching}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-surface-200 px-3 py-2 text-sm font-semibold text-surface-700 transition-colors hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                Muat ulang
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-md">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400"
              />
              <label htmlFor="production-activity-search" className="sr-only">
                Cari aktivitas produksi
              </label>
              <input
                id="production-activity-search"
                type="search"
                placeholder="Cari invoice, pelanggan, atau operator..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full rounded-xl border border-surface-200 bg-surface-50 py-2.5 pl-9 pr-9 text-sm text-surface-900 placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  aria-label="Hapus pencarian aktivitas"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-700"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <div
              role="tablist"
              aria-label="Filter aktivitas produksi"
              className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-surface-100 p-1"
            >
              {([
                ["ALL", "Semua"],
                ["PRINTING", "Printing"],
                ["READY_PICKUP", "Siap"],
                ["DELIVERED", "Selesai"],
              ] as const).map(([id, label]) => {
                const isActive = filter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onFilterChange(id)}
                    className={`min-h-[40px] whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      isActive
                        ? "bg-white text-surface-900 shadow-sm"
                        : "text-surface-600 hover:text-surface-900"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5">
          {isLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="flex min-h-[260px] flex-col items-center justify-center text-surface-400"
            >
              <RefreshCw className="mb-4 h-8 w-8 animate-spin text-surface-300" />
              <p className="text-sm">Memuat aktivitas produksi...</p>
            </div>
          ) : isError ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/50 px-6 py-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
                <AlertCircle className="h-7 w-7 text-red-600" aria-hidden="true" />
              </div>
              <p className="text-base font-semibold text-surface-900">
                Gagal memuat aktivitas
              </p>
              <p className="mt-1 text-sm text-surface-500">
                Coba muat ulang untuk mengambil perubahan terbaru.
              </p>
            </div>
          ) : activity.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-surface-200 bg-surface-50/60 px-6 py-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-surface-400 shadow-sm">
                <Activity className="h-7 w-7" aria-hidden="true" />
              </div>
              <p className="text-base font-semibold text-surface-900">
                Belum ada aktivitas produksi
              </p>
              <p className="mt-1 text-sm text-surface-500">
                Riwayat status dan notifikasi pickup akan muncul di sini.
              </p>
            </div>
          ) : groupedActivity.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-surface-200 bg-surface-50/60 px-6 py-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-surface-400 shadow-sm">
                <Search className="h-7 w-7" aria-hidden="true" />
              </div>
              <p className="text-base font-semibold text-surface-900">
                Tidak ada aktivitas yang cocok
              </p>
              <p className="mt-1 text-sm text-surface-500">
                Coba kata kunci atau filter status yang berbeda.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {groupedActivity.map((group) => (
                <section key={group.label} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-surface-500">
                      {group.label}
                    </h3>
                    <div className="h-px flex-1 bg-surface-200" />
                  </div>

                  <ol className="overflow-hidden rounded-2xl border border-surface-200 bg-white">
                    {group.entries.map((entry, index) => (
                      <li
                        key={entry.id}
                        className={`flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between ${
                          index > 0 ? "border-t border-surface-200" : ""
                        }`}
                      >
                        <div className="flex min-w-0 gap-3">
                          <div
                            aria-hidden="true"
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                              isPickupWhatsappActivity(entry)
                                ? "bg-emerald-500"
                                : entry.toStatus === "READY_PICKUP"
                                  ? "bg-emerald-500"
                                  : entry.toStatus === "PRINTING"
                                  ? "bg-blue-500"
                                  : "bg-surface-400"
                            }`}
                          >
                            {isPickupWhatsappActivity(entry) ? (
                              <MessageCircle className="h-3.5 w-3.5 text-white" />
                            ) : null}
                          </div>
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <p className="truncate font-mono text-xs font-bold text-surface-900">
                                  {entry.invoiceNumber || "Job order"}
                                </p>
                                <p className="mt-1 truncate text-sm text-surface-600">
                                  {entry.customerName || "Tanpa nama pelanggan"}
                                </p>
                              </div>
                              {isPickupWhatsappActivity(entry) ? (
                                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                  <MessageCircle className="h-3 w-3" aria-hidden="true" />
                                  WhatsApp pickup
                                </span>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${productionStatusTone(
                                      entry.fromStatus,
                                    )}`}
                                  >
                                    {productionStatusLabel(entry.fromStatus)}
                                  </span>
                                  <ArrowRight className="h-3.5 w-3.5 text-surface-300" />
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${productionStatusTone(
                                      entry.toStatus,
                                    )}`}
                                  >
                                    {productionStatusLabel(entry.toStatus)}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col gap-1 text-sm text-surface-600 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
                              <span className="font-semibold text-surface-900">
                                {entry.actorName}
                              </span>
                              <span className="inline-flex w-fit items-center rounded-full bg-surface-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-surface-600">
                                {entry.actorRole}
                              </span>
                              {isPickupWhatsappActivity(entry) ? (
                                <span>
                                  mengirim notifikasi WhatsApp pickup
                                </span>
                              ) : (
                                <span>
                                  memindahkan job order ke status{" "}
                                  <span className="font-medium text-surface-900">
                                    {productionStatusLabel(entry.toStatus)}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-xs text-surface-500 lg:pl-4">
                          <time
                            dateTime={entry.createdAt}
                            className="block font-medium text-surface-700"
                          >
                            {formatActivityDate(entry.createdAt)}
                          </time>
                          <span className="mt-1 block">
                            {formatRelative(
                              new Date(entry.createdAt).getTime(),
                              Date.now(),
                            )}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

export default function ProductionPage() {
  const { canPerform } = useRole();
  const canUpdateProduction = shouldShowUpdateAction("production", canPerform);
  const {
    data: jobOrders = [],
    isLoading,
    isError,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useJobOrders();
  const {
    data: productionActivity = [],
    isLoading: isActivityLoading,
    isError: isActivityError,
    isFetching: isActivityFetching,
    refetch: refetchActivity,
    dataUpdatedAt: activityUpdatedAt,
  } = useProductionActivity(20);
  const moveJobOrder = useMoveJobOrder();
  const sendPickupNotification = useSendPickupNotification();

  const [now, setNow] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<KanbanFilter>("ALL");
  const [activeTab, setActiveTab] = useState<ProductionPageTab>("board");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("ALL");
  const [pendingDelivery, setPendingDelivery] = useState<JobOrder | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobOrders;
    return jobOrders.filter((order) => {
      const haystack = [
        order.invoiceNumber,
        order.customerName ?? "",
        order.salesperson?.name ?? "",
        order.salesName ?? "",
        ...order.items.map((item) => item.productName),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [jobOrders, search]);

  const stats = useMemo(() => {
    const totalActive = visibleOrders.length;
    const overdueCount = visibleOrders.filter((order) => {
      if (!order.estimatedDoneAt || now === null) return false;
      return new Date(order.estimatedDoneAt).getTime() < now;
    }).length;
    const readyCount = visibleOrders.filter(
      (order) => order.productionStatus === "READY_PICKUP",
    ).length;
    const inProgressCount = visibleOrders.filter(
      (order) => order.productionStatus === "PRINTING",
    ).length;
    return { totalActive, overdueCount, readyCount, inProgressCount };
  }, [visibleOrders, now]);

  const filteredProductionActivity = useMemo(() => {
    const query = activitySearch.trim().toLowerCase();
    return productionActivity.filter((entry) => {
      const matchesFilter =
        activityFilter === "ALL" || entry.toStatus === activityFilter;
      if (!matchesFilter) return false;
      if (!query) return true;

      const haystack = [
        entry.invoiceNumber ?? "",
        entry.customerName ?? "",
        entry.actorName ?? "",
        entry.actorRole ?? "",
        entry.note ?? "",
        entry.eventType ?? "",
        productionStatusLabel(entry.fromStatus),
        productionStatusLabel(entry.toStatus),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [activityFilter, activitySearch, productionActivity]);

  const handleMoveForward = (id: string, nextStatus: ProductionStatus) => {
    if (!canUpdateProduction) return;
    if (nextStatus === "DELIVERED") {
      const order = jobOrders.find((item) => item.id === id);
      if (order) {
        setPendingDelivery(order);
        return;
      }
    }
    moveJobOrder.mutate({ id, productionStatus: nextStatus });
  };

  const handleDrop = (orderId: string, targetStatus: ProductionStatus) => {
    if (!canUpdateProduction) return;
    const current = jobOrders.find((order) => order.id === orderId);
    if (current && current.productionStatus !== targetStatus) {
      moveJobOrder.mutate({ id: orderId, productionStatus: targetStatus });
    }
  };

  const handleConfirmDelivery = (orderId: string) => {
    moveJobOrder.mutate(
      { id: orderId, productionStatus: "DELIVERED" },
      {
        onSuccess: () => setPendingDelivery(null),
      },
    );
  };

  const handleSendPickupNotification = (orderId: string) => {
    if (!canUpdateProduction) return;
    sendPickupNotification.mutate(orderId, {
      onSuccess: () => {
        refetchActivity();
      },
      onError: (error) => {
        alert(
          error instanceof Error
            ? error.message
            : "Gagal mengirim notifikasi WhatsApp pickup",
        );
      },
    });
  };

  const lastUpdatedLabel =
    now !== null && dataUpdatedAt > 0
      ? `Diperbarui ${formatRelative(dataUpdatedAt, now)}`
      : "Diperbarui baru saja";
  const activityUpdatedLabel =
    now !== null && activityUpdatedAt > 0
      ? `Sinkron ${formatRelative(activityUpdatedAt, now)}`
      : "Sinkron baru saja";

  return (
    <div className="flex-1 w-full overflow-y-auto">
      <div className="mx-auto max-w-full space-y-6 animate-in fade-in px-4 pb-12 pt-4 duration-500 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-surface-900 sm:text-3xl">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm"
              >
                <Kanban className="h-5 w-5 text-white" />
              </span>
              Papan Produksi
            </h1>
            <p className="mt-1 text-sm text-surface-500">
              Pantau job order dari struk sampai diserahkan.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              aria-live="polite"
              className="hidden items-center gap-1.5 text-xs text-surface-500 sm:inline-flex"
            >
              <span
                aria-hidden="true"
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  isFetching ? "bg-emerald-500 animate-pulse" : "bg-surface-300"
                }`}
              />
              {lastUpdatedLabel}
            </span>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Muat ulang job order"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-surface-200 bg-white px-3 py-2 text-xs font-semibold text-surface-700 transition-colors hover:bg-surface-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Muat ulang
            </button>
          </div>
        </div>

        <PageTabs value={activeTab} onChange={setActiveTab} />

        {activeTab === "activity" ? (
          <ProductionActivityFeed
            activity={filteredProductionActivity}
            isLoading={isActivityLoading}
            isError={isActivityError}
            isFetching={isActivityFetching}
            search={activitySearch}
            onSearchChange={setActivitySearch}
            filter={activityFilter}
            onFilterChange={setActivityFilter}
            onRefresh={() => refetchActivity()}
            refreshedLabel={activityUpdatedLabel}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Job Aktif"
                value={isLoading ? "..." : stats.totalActive}
                icon={<ClipboardList className="h-5 w-5 text-brand-600" />}
                color="bg-brand-50"
                delay="0ms"
                active={filter === "ALL"}
                onClick={() => setFilter("ALL")}
              />
              <StatCard
                label="Sedang Diproses"
                value={isLoading ? "..." : stats.inProgressCount}
                icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
                color="bg-blue-50"
                delay="75ms"
                active={filter === "PRINTING"}
                onClick={() => setFilter("PRINTING")}
              />
              <StatCard
                label="Siap Diambil"
                value={isLoading ? "..." : stats.readyCount}
                icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                color="bg-emerald-50"
                delay="150ms"
                active={filter === "READY_PICKUP"}
                onClick={() => setFilter("READY_PICKUP")}
              />
              <StatCard
                label="Terlambat"
                value={isLoading ? "..." : stats.overdueCount}
                icon={<Clock className="h-5 w-5 text-red-600" />}
                color="bg-red-50"
                delay="225ms"
                active={filter === "OVERDUE"}
                onClick={() => setFilter("OVERDUE")}
              />
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative max-w-xl flex-1">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400"
                />
                <label htmlFor="production-search" className="sr-only">
                  Cari job order
                </label>
                <input
                  id="production-search"
                  type="search"
                  placeholder="Cari invoice, pelanggan, produk, atau sales..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-surface-200 bg-white py-2.5 pl-9 pr-9 text-sm placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Hapus pencarian"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <FilterPills
                value={filter}
                onChange={setFilter}
                overdueCount={stats.overdueCount}
              />
            </div>

            {isLoading ? (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-col items-center justify-center py-24 text-surface-400 animate-pulse"
              >
                <RefreshCw
                  className="mb-4 h-8 w-8 animate-spin text-surface-300"
                  aria-hidden="true"
                />
                <p className="text-sm">Memuat papan produksi...</p>
              </div>
            ) : isError ? (
              <Card className="flex flex-col items-center justify-center border-red-200 bg-red-50/30 py-20">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
                  <AlertCircle className="h-7 w-7 text-red-600" aria-hidden="true" />
                </div>
                <p className="mb-1 font-semibold text-surface-900">
                  Gagal memuat job order
                </p>
                <p className="mb-4 text-sm text-surface-500">
                  Cek koneksi database, lalu coba lagi.
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Coba lagi
                </button>
              </Card>
            ) : jobOrders.length === 0 ? (
              <Card glass className="flex flex-col items-center justify-center py-20">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-100">
                  <Kanban className="h-8 w-8 text-surface-300" aria-hidden="true" />
                </div>
                <p className="mb-1 font-semibold text-surface-900">
                  Belum ada job order aktif
                </p>
                <p className="text-sm text-surface-500">
                  Buat transaksi dengan &quot;Job Order&quot; aktif dari POS untuk melihatnya di sini.
                </p>
              </Card>
            ) : visibleOrders.length === 0 ? (
              <Card glass className="flex flex-col items-center justify-center py-16">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-100">
                  <Search className="h-7 w-7 text-surface-300" aria-hidden="true" />
                </div>
                <p className="mb-1 font-semibold text-surface-900">
                  Tidak ada job order yang cocok
                </p>
                <p className="mb-4 text-sm text-surface-500">
                  Coba kata pencarian lain atau hapus filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFilter("ALL");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                >
                  Hapus filter
                </button>
              </Card>
            ) : (
              <KanbanBoard
                orders={visibleOrders}
                filter={filter}
                onMoveForward={canUpdateProduction ? handleMoveForward : undefined}
                onSendPickupNotification={
                  canUpdateProduction ? handleSendPickupNotification : undefined
                }
                pickupNotificationPendingId={
                  sendPickupNotification.isPending
                    ? sendPickupNotification.variables ?? null
                    : null
                }
                onDrop={canUpdateProduction ? handleDrop : undefined}
              />
            )}
          </>
        )}
      </div>

      <ConfirmDeliveryModal
        order={pendingDelivery}
        isPending={moveJobOrder.isPending}
        onConfirm={handleConfirmDelivery}
        onClose={() =>
          moveJobOrder.isPending ? undefined : setPendingDelivery(null)
        }
      />
    </div>
  );
}

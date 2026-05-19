"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@pos/ui";
import { useJobOrders, useMoveJobOrder, ProductionStatus, JobOrder } from "@/hooks/useJobOrders";
import KanbanBoard, { KanbanFilter } from "@/components/kanban/KanbanBoard";
import { ConfirmDeliveryModal } from "@/components/kanban/ConfirmDeliveryModal";
import {
  Kanban,
  RefreshCw,
  AlertCircle,
  ClipboardList,
  Clock,
  CheckCircle2,
  TrendingUp,
  Search,
  X,
} from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import { shouldShowUpdateAction } from "@/features/rbac/helpers/rbac-ui";

// ─── Stat Card ──────────────────────────────────────────────────────────────────

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
          <p className="text-xs font-medium text-surface-500 uppercase tracking-wider">
            {label}
          </p>
          <p className="text-2xl font-extrabold text-surface-900 mt-2">
            {value}
          </p>
        </div>
        <div
          className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}

// ─── Filter Pills ───────────────────────────────────────────────────────────────

const FILTER_OPTIONS: ReadonlyArray<{ id: KanbanFilter; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "PRINTING", label: "In Progress" },
  { id: "READY_PICKUP", label: "Ready" },
  { id: "OVERDUE", label: "Overdue" },
];

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
      aria-label="Filter job orders"
      className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-100/80 border border-surface-200 w-fit"
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
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                       transition-colors cursor-pointer min-h-[32px]
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                         isActive
                           ? "bg-white text-surface-900 shadow-sm"
                           : "text-surface-600 hover:text-surface-900"
                       }`}
          >
            {opt.label}
            {showBadge ? (
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1.5 ${
                  isActive
                    ? "bg-red-100 text-red-700"
                    : "bg-red-500 text-white"
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

// ─── Last Updated ───────────────────────────────────────────────────────────────

function formatRelative(from: number, to: number): string {
  const seconds = Math.max(0, Math.floor((to - from) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

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
  const moveJobOrder = useMoveJobOrder();

  const [now, setNow] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<KanbanFilter>("ALL");
  const [pendingDelivery, setPendingDelivery] = useState<JobOrder | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Filtered orders (search applied here; status/overdue filter is visualized via dimming)
  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobOrders;
    return jobOrders.filter((o) => {
      const haystack = [
        o.invoiceNumber,
        o.customerName ?? "",
        o.salesperson?.name ?? "",
        o.salesName ?? "",
        ...o.items.map((i) => i.productName),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [jobOrders, search]);

  const stats = useMemo(() => {
    const totalActive = visibleOrders.length;
    const overdueCount = visibleOrders.filter((o) => {
      if (!o.estimatedDoneAt || now === null) return false;
      return new Date(o.estimatedDoneAt).getTime() < now;
    }).length;
    const readyCount = visibleOrders.filter(
      (o) => o.productionStatus === "READY_PICKUP"
    ).length;
    const inProgressCount = visibleOrders.filter(
      (o) => o.productionStatus === "PRINTING"
    ).length;
    return { totalActive, overdueCount, readyCount, inProgressCount };
  }, [visibleOrders, now]);

  const handleMoveForward = (id: string, nextStatus: ProductionStatus) => {
    if (!canUpdateProduction) return;
    if (nextStatus === "DELIVERED") {
      const order = jobOrders.find((o) => o.id === id);
      if (order) {
        setPendingDelivery(order);
        return;
      }
    }
    moveJobOrder.mutate({ id, productionStatus: nextStatus });
  };

  const handleDrop = (orderId: string, targetStatus: ProductionStatus) => {
    if (!canUpdateProduction) return;
    const current = jobOrders.find((o) => o.id === orderId);
    if (current && current.productionStatus !== targetStatus) {
      moveJobOrder.mutate({ id: orderId, productionStatus: targetStatus });
    }
  };

  const handleConfirmDelivery = (orderId: string) => {
    moveJobOrder.mutate(
      { id: orderId, productionStatus: "DELIVERED" },
      {
        onSuccess: () => setPendingDelivery(null),
      }
    );
  };

  const lastUpdatedLabel =
    now !== null && dataUpdatedAt > 0
      ? `Updated ${formatRelative(dataUpdatedAt, now)}`
      : "Updated just now";

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="max-w-full mx-auto space-y-6 animate-in fade-in duration-500 pb-12 pt-4 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-surface-900 tracking-tight flex items-center gap-3">
              <span
                aria-hidden="true"
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm"
              >
                <Kanban className="w-5 h-5 text-white" />
              </span>
              Production Board
            </h1>
            <p className="text-sm text-surface-500 mt-1">
              Track job orders from receipt to delivery.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              aria-live="polite"
              className="text-xs text-surface-500 hidden sm:inline-flex items-center gap-1.5"
            >
              <span
                aria-hidden="true"
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  isFetching ? "bg-emerald-500 animate-pulse" : "bg-surface-300"
                }`}
              />
              {lastUpdatedLabel}
            </span>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh job orders"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-surface-200 bg-white
                         text-xs font-semibold text-surface-700 hover:bg-surface-50 transition-colors
                         disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer min-h-[36px]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Active Jobs"
            value={isLoading ? "..." : stats.totalActive}
            icon={<ClipboardList className="w-5 h-5 text-brand-600" />}
            color="bg-brand-50"
            delay="0ms"
            active={filter === "ALL"}
            onClick={() => setFilter("ALL")}
          />
          <StatCard
            label="In Progress"
            value={isLoading ? "..." : stats.inProgressCount}
            icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
            color="bg-blue-50"
            delay="75ms"
            active={filter === "PRINTING"}
            onClick={() => setFilter("PRINTING")}
          />
          <StatCard
            label="Ready for Pickup"
            value={isLoading ? "..." : stats.readyCount}
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            color="bg-emerald-50"
            delay="150ms"
            active={filter === "READY_PICKUP"}
            onClick={() => setFilter("READY_PICKUP")}
          />
          <StatCard
            label="Overdue"
            value={isLoading ? "..." : stats.overdueCount}
            icon={<Clock className="w-5 h-5 text-red-600" />}
            color="bg-red-50"
            delay="225ms"
            active={filter === "OVERDUE"}
            onClick={() => setFilter("OVERDUE")}
          />
        </div>

        {/* Search + Filter Pills */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 max-w-xl">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400"
            />
            <label htmlFor="production-search" className="sr-only">
              Search job orders
            </label>
            <input
              id="production-search"
              type="search"
              placeholder="Search invoice, customer, product, or sales..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-surface-200 bg-white text-sm
                         placeholder:text-surface-400
                         focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-surface-400
                           hover:bg-surface-100 hover:text-surface-700 transition-colors cursor-pointer
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <FilterPills
            value={filter}
            onChange={setFilter}
            overdueCount={stats.overdueCount}
          />
        </div>

        {/* Kanban Board */}
        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center justify-center py-24 text-surface-400 animate-pulse"
          >
            <RefreshCw
              className="w-8 h-8 mb-4 animate-spin text-surface-300"
              aria-hidden="true"
            />
            <p className="text-sm">Loading production board...</p>
          </div>
        ) : isError ? (
          <Card className="flex flex-col items-center justify-center py-20 border-red-200 bg-red-50/30">
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
              <AlertCircle
                className="w-7 h-7 text-red-600"
                aria-hidden="true"
              />
            </div>
            <p className="text-surface-900 font-semibold mb-1">
              Failed to load job orders
            </p>
            <p className="text-sm text-surface-500 mb-4">
              Please check your database connection.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white
                         text-sm font-semibold hover:bg-red-700 transition-colors cursor-pointer
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Try again
            </button>
          </Card>
        ) : jobOrders.length === 0 ? (
          <Card
            glass
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
              <Kanban
                className="w-8 h-8 text-surface-300"
                aria-hidden="true"
              />
            </div>
            <p className="text-surface-900 font-semibold mb-1">
              No active job orders
            </p>
            <p className="text-sm text-surface-500">
              Create a transaction with &quot;Job Order&quot; enabled from the
              POS to see it here.
            </p>
          </Card>
        ) : visibleOrders.length === 0 ? (
          <Card
            glass
            className="flex flex-col items-center justify-center py-16"
          >
            <div className="w-14 h-14 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
              <Search
                className="w-7 h-7 text-surface-300"
                aria-hidden="true"
              />
            </div>
            <p className="text-surface-900 font-semibold mb-1">
              No matching job orders
            </p>
            <p className="text-sm text-surface-500 mb-4">
              Try a different search term or clear your filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilter("ALL");
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white
                         text-sm font-semibold hover:bg-brand-700 transition-colors cursor-pointer
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              Clear filters
            </button>
          </Card>
        ) : (
          <KanbanBoard
            orders={visibleOrders}
            filter={filter}
            onMoveForward={canUpdateProduction ? handleMoveForward : undefined}
            onDrop={canUpdateProduction ? handleDrop : undefined}
          />
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

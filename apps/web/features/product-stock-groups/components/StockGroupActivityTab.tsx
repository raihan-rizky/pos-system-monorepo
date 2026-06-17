"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Search,
} from "lucide-react";

import {
  fetchStockGroupActivities,
  type StockGroupActivity,
} from "@/features/product-stock-groups/api/stock-group-activities";

const intFmt = new Intl.NumberFormat("id-ID");

interface StockGroupActivityTabProps {
  onOpenStockGroup: (stockGroupId: string) => void;
}

interface StockGroupActivityListProps {
  activities: StockGroupActivity[];
  onOpenStockGroup: (stockGroupId: string) => void;
}

function activityLabel(type: string): string {
  const labels: Record<string, string> = {
    VARIANT_ADDED: "Varian Ditambahkan",
    PAIRED_VARIANTS_CREATED: "Varian Unit Dibuat",
    CONVERSION_RATE_CHANGED: "Unit Management Diubah",
    GROUP_CREATED: "Grup Dibuat",
    SHARED_STOCK_CHANGED: "Shared Stock Diubah",
    REVIEW_CLEARED: "Review Diselesaikan",
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StockGroupActivityList({
  activities,
  onOpenStockGroup,
}: StockGroupActivityListProps) {
  if (activities.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
        <Boxes className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-black text-slate-700">
          Belum ada aktivitas grup
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Aktivitas non-conversion akan muncul di sini.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {activities.map((activity) => {
        const canOpen = Boolean(activity.stockGroupId);
        return (
          <button
            key={activity.id}
            type="button"
            disabled={!canOpen}
            onClick={() => canOpen && onOpenStockGroup(activity.stockGroupId)}
            className="grid w-full grid-cols-1 gap-3 border-b border-slate-100 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 md:grid-cols-[180px_1fr_180px]"
          >
            <div>
              <p className="text-xs font-black uppercase text-slate-400">
                {activityLabel(activity.type)}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {formatDateTime(activity.createdAt)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">
                {activity.stockGroup?.displayName ?? "Grup stok"}
              </p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                {activity.product
                  ? `${activity.product.sku} - ${activity.product.unit}`
                  : "Tanpa produk terkait"}
              </p>
              {activity.note && (
                <p className="mt-2 text-xs font-semibold text-slate-600">
                  {activity.note}
                </p>
              )}
            </div>
            <div className="text-left md:text-right">
              <p className="text-xs font-bold text-slate-500">
                {activity.person ?? activity.createdBy ?? "Sistem"}
              </p>
              <p className="mt-1 text-xs font-black text-sky-700">
                Buka Stok Unit
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function StockGroupActivityTab({
  onOpenStockGroup,
}: StockGroupActivityTabProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof fetchStockGroupActivities>
  > | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 20;

  const trimmedSearch = useMemo(() => search.trim(), [search]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchStockGroupActivities({
      page,
      limit,
      search: trimmedSearch || undefined,
    })
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal memuat aktivitas grup");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, trimmedSearch]);

  const pagination = data?.pagination;
  const activities = data?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-bold uppercase text-slate-500">
            Aktivitas Grup
          </span>
          {pagination && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              {intFmt.format(pagination.total)} entri
            </span>
          )}
        </div>
        <label className="relative block w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Cari grup, SKU, unit, atau catatan..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-400"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-slate-50 px-5 py-12 text-sm font-semibold text-slate-500">
          <Clock className="h-4 w-4" />
          Memuat aktivitas grup...
        </div>
      ) : (
        <StockGroupActivityList
          activities={activities}
          onOpenStockGroup={onOpenStockGroup}
        />
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={!pagination.hasPreviousPage}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Sebelumnya
          </button>
          <p className="text-xs font-bold text-slate-500">
            Halaman {pagination.page} / {pagination.totalPages}
          </p>
          <button
            type="button"
            disabled={!pagination.hasNextPage}
            onClick={() => setPage((current) => current + 1)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 disabled:opacity-40"
          >
            Berikutnya
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

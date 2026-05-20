"use client";

import React, { useMemo } from "react";
import { formatRupiah } from "@/lib/utils";
import type { TopProduct } from "../types";

interface TopProductsListProps {
  data: TopProduct[];
  loading?: boolean;
  maxRows?: number;
}

const rankBadge: Record<number, string> = {
  1: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  2: "bg-surface-100 text-surface-700 ring-1 ring-surface-200",
  3: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
};

export const TopProductsList: React.FC<TopProductsListProps> = React.memo(
  function TopProductsList({ data, loading, maxRows = 5 }) {
    const visible = useMemo(
      () => (data ?? []).slice(0, maxRows),
      [data, maxRows],
    );
    const max = useMemo(
      () => visible.reduce((m, r) => Math.max(m, r.quantity), 0),
      [visible],
    );

    if (loading) {
      return (
        <ul className="divide-y divide-surface-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="py-3">
              <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-full bg-surface-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-surface-100 animate-pulse" />
                  <div className="h-1.5 w-full rounded-full bg-surface-100 animate-pulse" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      );
    }

    if (visible.length === 0) {
      return (
        <p className="text-sm text-surface-500 text-center py-8">
          Belum ada penjualan produk.
        </p>
      );
    }

    return (
      <ol className="divide-y divide-surface-100">
        {visible.map((row, idx) => {
          const rank = idx + 1;
          const pct = max > 0 ? (row.quantity / max) * 100 : 0;
          return (
            <li key={row.name} className="py-3">
              <div className="flex items-center gap-3">
                <span
                  aria-label={`Peringkat ${rank}`}
                  className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                    rankBadge[rank] ?? "bg-surface-50 text-surface-500"
                  }`}
                >
                  {rank}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-surface-900 truncate">
                      {row.name}
                    </p>
                    <p className="text-sm font-bold text-surface-900 tabular-nums shrink-0">
                      {row.quantity}
                      <span className="ml-0.5 text-[10px] font-medium text-surface-500">
                        pcs
                      </span>
                    </p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div
                      className="flex-1 h-1.5 rounded-full bg-surface-100 overflow-hidden"
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-full bg-amber-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[11px] tabular-nums text-emerald-700 font-semibold shrink-0">
                      {formatRupiah(row.revenue)}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    );
  },
);

export default TopProductsList;

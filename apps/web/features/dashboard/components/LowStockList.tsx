"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { LowStockProduct } from "../types";

interface LowStockListProps {
  data: LowStockProduct[];
  loading?: boolean;
  maxRows?: number;
}

export const LowStockList: React.FC<LowStockListProps> = React.memo(
  function LowStockList({ data, loading, maxRows = 5 }) {
    if (loading) {
      return (
        <ul className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="h-12 rounded-lg bg-surface-50 animate-pulse"
            />
          ))}
        </ul>
      );
    }

    if (!data || data.length === 0) {
      return (
        <p className="text-sm text-surface-500 text-center py-6">
          Semua stok aman.
        </p>
      );
    }

    const visible = data.slice(0, maxRows);

    return (
      <>
        <ul className="divide-y divide-surface-100">
          {visible.map((item) => {
            const ratio =
              item.minStock > 0
                ? Math.min(1, item.stock / item.minStock)
                : 0;
            const tone =
              ratio <= 0.25
                ? "bg-red-500"
                : ratio <= 0.6
                  ? "bg-amber-500"
                  : "bg-emerald-500";
            return (
              <li key={item.id} className="py-2.5">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600 shrink-0"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-surface-900 truncate">
                        {item.name}
                      </p>
                      <p className="text-xs font-bold text-surface-900 tabular-nums shrink-0">
                        {item.stock}
                        <span className="font-medium text-surface-500">
                          /{item.minStock} {item.unit}
                        </span>
                      </p>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 rounded-full bg-surface-100 overflow-hidden"
                      aria-hidden="true"
                    >
                      <span
                        className={`block h-full rounded-full ${tone}`}
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {data.length > maxRows && (
          <Link
            href="/inventory"
            className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800 cursor-pointer focus:outline-none focus-visible:underline"
          >
            Lihat semua ({data.length})
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </>
    );
  },
);

export default LowStockList;

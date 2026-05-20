"use client";

import React from "react";
import { formatRupiah } from "@/lib/utils";

export interface RankRow {
  key: string;
  name: string;
  primaryValue: string;
  hint?: string;
}

interface RankListProps {
  rows: RankRow[];
  loading?: boolean;
  emptyText: string;
  accent?: "brand" | "amber" | "purple";
}

const rankColor: Record<NonNullable<RankListProps["accent"]>, string> = {
  brand: "bg-brand-50 text-brand-700 ring-1 ring-brand-100",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  purple: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
};

export const RankList: React.FC<RankListProps> = React.memo(function RankList({
  rows,
  loading,
  emptyText,
  accent = "brand",
}) {
  if (loading) {
    return (
      <ul className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-surface-100 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-1/2 rounded bg-surface-100 animate-pulse" />
              <div className="h-2.5 w-1/3 rounded bg-surface-100 animate-pulse" />
            </div>
            <div className="h-4 w-16 rounded bg-surface-100 animate-pulse" />
          </li>
        ))}
      </ul>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <p className="text-sm text-surface-500 text-center py-6">{emptyText}</p>
    );
  }

  return (
    <ol className="divide-y divide-surface-100">
      {rows.map((row, idx) => (
        <li key={row.key} className="py-2.5 flex items-center gap-3">
          <span
            className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${rankColor[accent]}`}
          >
            {idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-surface-900 truncate">
              {row.name}
            </p>
            {row.hint && (
              <p className="text-[11px] text-surface-500 truncate">{row.hint}</p>
            )}
          </div>
          <p className="text-sm font-semibold text-surface-900 tabular-nums shrink-0">
            {row.primaryValue}
          </p>
        </li>
      ))}
    </ol>
  );
});

export function formatRupiahLabel(value: unknown): string {
  return formatRupiah(Number(value || 0));
}

export default RankList;

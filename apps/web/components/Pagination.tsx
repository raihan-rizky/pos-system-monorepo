"use client";

import React from "react";
import {
  buildPageWindow,
  type PageWindowItem,
} from "@/features/pos-search/pos-pagination";

const intFmt = new Intl.NumberFormat("id-ID");

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  isFetching?: boolean;
  onPageChange: (next: number) => void;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  isFetching = false,
  onPageChange,
  className = "",
}: PaginationProps) {
  if (total <= 0) return null;

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const canPrev = page > 1 && !isFetching;
  const canNext = page < totalPages && !isFetching;
  const window: PageWindowItem[] = buildPageWindow(page, totalPages, 1);

  return (
    <nav
      aria-label="Pagination produk"
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-3 md:px-6 py-3 border-t border-surface-100 bg-white ${className}`}
    >
      <p className="text-xs font-medium text-surface-500" aria-live="polite">
        Menampilkan {intFmt.format(start)}–{intFmt.format(end)} dari{" "}
        <span className="font-semibold text-surface-700">
          {intFmt.format(total)}
        </span>{" "}
        produk
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => canPrev && onPageChange(page - 1)}
          disabled={!canPrev}
          aria-label="Halaman sebelumnya"
          className="flex items-center gap-1 h-9 px-3 rounded-xl border border-surface-200 bg-white text-sm font-semibold text-surface-700 transition-all hover:bg-surface-50 hover:border-surface-300 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="hidden sm:inline">Sebelumnya</span>
        </button>

        <ul className="hidden md:flex items-center gap-1" role="list">
          {window.map((item, idx) => {
            if (item === "…") {
              return (
                <li key={`gap-${idx}`} className="px-2 text-surface-400 select-none" aria-hidden="true">
                  …
                </li>
              );
            }
            const isActive = item === page;
            return (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => !isActive && !isFetching && onPageChange(item)}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Halaman ${item}`}
                  disabled={isFetching}
                  className={`min-w-9 h-9 px-3 rounded-xl text-sm font-semibold tabular-nums transition-all ${
                    isActive
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-white border border-surface-200 text-surface-700 hover:bg-surface-50 hover:border-surface-300"
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {intFmt.format(item)}
                </button>
              </li>
            );
          })}
        </ul>

        <div
          className="md:hidden flex items-center gap-1.5 h-9 px-3 rounded-xl bg-surface-100 text-xs font-bold text-surface-700"
          aria-current="page"
        >
          <span className="tabular-nums">{intFmt.format(page)}</span>
          <span className="text-surface-400">/</span>
          <span className="tabular-nums">{intFmt.format(totalPages)}</span>
        </div>

        <button
          type="button"
          onClick={() => canNext && onPageChange(page + 1)}
          disabled={!canNext}
          aria-label="Halaman berikutnya"
          className="flex items-center gap-1 h-9 px-3 rounded-xl border border-surface-200 bg-white text-sm font-semibold text-surface-700 transition-all hover:bg-surface-50 hover:border-surface-300 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="hidden sm:inline">Berikutnya</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </nav>
  );
}

"use client";

import { useEffect, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

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

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return `${MONTH_NAMES_ID[m - 1]} ${y}`;
}

function formatMonthLabelShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  const short = MONTH_NAMES_ID[m - 1]?.slice(0, 3);
  return `${short} ${y}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export function KeuanganTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = useMemo(() => currentJakartaMonth(), []);
  const month = searchParams.get("month") || today;
  const isFutureMonth = month >= today;

  useEffect(() => {
    if (!searchParams.get("month")) {
      const next = new URLSearchParams(searchParams.toString());
      next.set("month", today);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }
  }, [pathname, router, searchParams, today]);

  const setMonth = (newMonth: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("month", newMonth);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <header className="border-b border-surface-200 bg-white/80 backdrop-blur sticky top-0 z-30">
      <div className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-baseline gap-2 sm:gap-3">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-surface-900 truncate">
            Keuangan
          </h1>
          <p className="hidden sm:block text-xs text-surface-500 truncate">
            Pemasukan & Pengeluaran
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-surface-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 inline-flex items-center justify-center px-2.5 py-1.5 text-surface-600 hover:text-surface-900 cursor-pointer rounded-l-xl hover:bg-surface-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            aria-label="Bulan sebelumnya"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span
            className="px-2 sm:px-3 py-1.5 text-sm font-semibold text-surface-900 min-w-[88px] sm:min-w-[120px] text-center tabular-nums"
            aria-live="polite"
          >
            <span className="sm:hidden">{formatMonthLabelShort(month)}</span>
            <span className="hidden sm:inline">{formatMonthLabel(month)}</span>
          </span>
          <button
            type="button"
            onClick={() => !isFutureMonth && setMonth(shiftMonth(month, 1))}
            disabled={isFutureMonth}
            className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 inline-flex items-center justify-center px-2.5 py-1.5 text-surface-600 hover:text-surface-900 cursor-pointer rounded-r-xl hover:bg-surface-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            aria-label="Bulan berikutnya"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

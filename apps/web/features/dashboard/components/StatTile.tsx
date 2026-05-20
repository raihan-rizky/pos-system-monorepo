"use client";

import React from "react";

export type StatTone = "brand" | "success" | "warning" | "danger" | "neutral";

interface StatTileProps {
  label: string;
  value: string | number;
  hint?: React.ReactNode;
  tone?: StatTone;
  icon: React.ReactNode;
  loading?: boolean;
}

const toneStyles: Record<
  StatTone,
  { value: string; iconBg: string; iconText: string; accent: string }
> = {
  brand: {
    value: "text-surface-900",
    iconBg: "bg-brand-50",
    iconText: "text-brand-600",
    accent: "from-brand-500/10 via-transparent",
  },
  success: {
    value: "text-emerald-700",
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    accent: "from-emerald-500/10 via-transparent",
  },
  warning: {
    value: "text-amber-700",
    iconBg: "bg-amber-50",
    iconText: "text-amber-600",
    accent: "from-amber-500/10 via-transparent",
  },
  danger: {
    value: "text-red-600",
    iconBg: "bg-red-50",
    iconText: "text-red-600",
    accent: "from-red-500/10 via-transparent",
  },
  neutral: {
    value: "text-surface-900",
    iconBg: "bg-surface-100",
    iconText: "text-surface-600",
    accent: "from-surface-300/20 via-transparent",
  },
};

export const StatTile: React.FC<StatTileProps> = React.memo(function StatTile({
  label,
  value,
  hint,
  tone = "brand",
  icon,
  loading,
}) {
  const style = toneStyles[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-surface-200 bg-white p-4 md:p-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b ${style.accent} to-transparent`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-surface-500">
            {label}
          </p>
          {loading ? (
            <div className="mt-2 h-7 w-28 rounded-md bg-surface-100 animate-pulse" />
          ) : (
            <p
              className={`mt-1.5 text-xl md:text-2xl font-bold tabular-nums ${style.value}`}
            >
              {value}
            </p>
          )}
          {loading ? (
            <div className="mt-2 h-3 w-24 rounded bg-surface-100 animate-pulse" />
          ) : hint ? (
            <p className="mt-1 text-[11px] text-surface-500 truncate">{hint}</p>
          ) : null}
        </div>
        <span
          aria-hidden="true"
          className={`shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-xl ${style.iconBg} ${style.iconText}`}
        >
          {icon}
        </span>
      </div>
    </div>
  );
});

export default StatTile;

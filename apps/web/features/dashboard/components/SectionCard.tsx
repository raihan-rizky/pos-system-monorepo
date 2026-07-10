"use client";

import React from "react";

export type SectionAccent = "brand" | "success" | "warning" | "danger" | "neutral";

interface SectionCardProps {
  title: string;
  subtitle?: string;
  accent?: SectionAccent;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

const accentBar: Record<SectionAccent, string> = {
  brand: "bg-brand-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-surface-400",
};

const accentIconBg: Record<SectionAccent, string> = {
  brand: "bg-brand-50 text-brand-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
  neutral: "bg-surface-100 text-surface-600",
};

export const SectionCard: React.FC<SectionCardProps> = React.memo(
  function SectionCard({
    title,
    subtitle,
    accent = "brand",
    icon,
    action,
    children,
    className = "",
    bodyClassName = "p-5",
  }) {
    return (
      <section
        className={`rounded-2xl border border-surface-200 bg-white shadow-sm ${className}`}
      >
        <header className="px-5 py-4 border-b border-surface-100 flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`w-1.5 h-5 rounded-full ${accentBar[accent]}`}
          />
          {icon ? (
            <span
              aria-hidden="true"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${accentIconBg[accent]}`}
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-surface-900 truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[11px] text-surface-500 truncate">{subtitle}</p>
            )}
          </div>
          {action && <div className="ml-auto shrink-0">{action}</div>}
        </header>
        <div className={bodyClassName}>{children}</div>
      </section>
    );
  },
);

export default SectionCard;

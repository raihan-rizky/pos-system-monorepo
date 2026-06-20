import React from "react";
import { AlertTriangle, CheckCircle2, CopyPlus, RefreshCw, SkipForward } from "lucide-react";
import type { ImportAutoAction } from "../types";

interface AutoActionBadgeProps {
  action?: ImportAutoAction;
  reason?: string;
  conversionNeedsReview?: boolean;
}

const actionMeta: Record<
  ImportAutoAction,
  {
    label: string;
    className: string;
    icon: React.ReactNode;
  }
> = {
  create: {
    label: "Create",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  auto_skip: {
    label: "Auto skip",
    className: "border-slate-200 bg-slate-50 text-slate-700",
    icon: <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  auto_price_update: {
    label: "Auto price",
    className: "border-blue-200 bg-blue-50 text-blue-700",
    icon: <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  auto_create_variant: {
    label: "Auto variant",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: <CopyPlus className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  conflict: {
    label: "Conflict",
    className: "border-red-200 bg-red-50 text-red-700",
    icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  same_unit_price_conflict: {
    label: "Price conflict",
    className: "border-red-200 bg-red-50 text-red-700",
    icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
  },
};

export function AutoActionBadge({
  action,
  reason,
  conversionNeedsReview,
}: AutoActionBadgeProps) {
  if (!action) return null;

  const meta = conversionNeedsReview
    ? {
        label: "Review",
        className: "border-amber-200 bg-amber-50 text-amber-700",
        icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
      }
    : actionMeta[action];

  return (
    <span
      className={`inline-flex min-h-8 max-w-[220px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${meta.className}`}
      title={reason}
    >
      {meta.icon}
      <span className="shrink-0">{meta.label}</span>
      {reason && <span className="truncate font-medium opacity-80">{reason}</span>}
    </span>
  );
}

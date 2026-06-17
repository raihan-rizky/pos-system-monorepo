import React from "react";
import type { SuratJalanBundle } from "../api/surat-jalan-api";

interface SuratJalanStatsProps {
  progress: SuratJalanBundle["progress"];
}

export const SuratJalanStats: React.FC<SuratJalanStatsProps> = ({ progress }) => {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <MetricCard label="Total Qty" value={progress.totalQuantity} />
      <MetricCard label="Terkirim" value={progress.deliveredQuantity} variant="success" />
      <MetricCard label="Sisa" value={progress.remainingQuantity} />
      <MetricCard label="Pending" value={progress.pendingQuantity} variant="warning" />
    </div>
  );
};

interface MetricCardProps {
  label: string;
  value: number;
  variant?: "default" | "success" | "warning";
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, variant = "default" }) => {
  const bgClass =
    variant === "success"
      ? "bg-emerald-50/50 border-emerald-100"
      : variant === "warning"
        ? "bg-amber-50/50 border-amber-100"
        : "bg-surface-50/50 border-surface-200";

  const labelClass =
    variant === "success"
      ? "text-emerald-600"
      : variant === "warning"
        ? "text-amber-600"
        : "text-surface-500";

  const valueClass =
    variant === "success"
      ? "text-emerald-900"
      : variant === "warning"
        ? "text-amber-900"
        : "text-surface-900";

  return (
    <div className={`relative overflow-hidden rounded-2xl border px-4 py-3.5 shadow-sm transition-all duration-200 hover:shadow-md ${bgClass}`}>
      <div className={`text-[11px] font-black uppercase tracking-widest ${labelClass}`}>
        {label}
      </div>
      <div className={`mt-1 text-2xl font-black tabular-nums tracking-tight ${valueClass}`}>
        {value}
      </div>
    </div>
  );
};

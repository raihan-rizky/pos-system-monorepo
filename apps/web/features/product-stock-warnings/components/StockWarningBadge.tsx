"use client";

import React from "react";
import { AlertTriangle, AlertCircle } from "lucide-react";
import { getStockWarningInfo } from "../helpers";

interface StockWarningBadgeProps {
  stock: number;
  minStock: number;
  productName: string;
  showLabel?: boolean;
}

export function StockWarningBadge({
  stock,
  minStock,
  productName,
  showLabel = false,
}: StockWarningBadgeProps) {
  const warningInfo = getStockWarningInfo(stock, minStock, productName);

  if (!warningInfo) return null;

  const isCritical = warningInfo.severity === "critical";
  const iconColor = isCritical ? "text-red-600" : "text-amber-600";
  const bgColor = isCritical ? "bg-red-50" : "bg-amber-50";
  const borderColor = isCritical ? "border-red-200" : "border-amber-200";
  const hoverBgColor = isCritical ? "hover:bg-red-100" : "hover:bg-amber-100";
  const Icon = isCritical ? AlertCircle : AlertTriangle;

  return (
    <div className="group relative inline-flex">
      <button
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${borderColor} ${bgColor} ${hoverBgColor} transition-colors duration-200 cursor-help`}
        aria-label={warningInfo.message}
      >
        <Icon className={`w-4 h-4 ${iconColor}`} />
        {showLabel && (
          <span className={`text-xs font-bold ${isCritical ? "text-red-700" : "text-amber-700"}`}>
            {isCritical ? "Stok Minus" : "Stok Menipis"}
          </span>
        )}
      </button>

      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 shadow-lg">
        {warningInfo.message}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-900"></div>
      </div>
    </div>
  );
}

export function StockWarningIcon({
  stock,
  minStock,
  productName,
}: Omit<StockWarningBadgeProps, "showLabel">) {
  const warningInfo = getStockWarningInfo(stock, minStock, productName);

  if (!warningInfo) return null;

  const isCritical = warningInfo.severity === "critical";
  const iconColor = isCritical ? "text-red-600" : "text-amber-600";
  const Icon = isCritical ? AlertCircle : AlertTriangle;

  return (
    <div className="group relative inline-flex">
      <Icon className={`w-5 h-5 ${iconColor} cursor-help`} />

      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 shadow-lg">
        {warningInfo.message}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-900"></div>
      </div>
    </div>
  );
}

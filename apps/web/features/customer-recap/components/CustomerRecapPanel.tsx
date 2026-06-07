"use client";

import React, { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { PackageOpen } from "lucide-react";
import { useCustomerDetailRecap } from "../hooks/useCustomerRecap";
import type { CustomerRecapQuery } from "../types/customer-recap";

const RecapTrendChart = lazy(() => import("./RecapTrendChart"));

interface CustomerRecapPanelProps {
  customerId: string;
  range: CustomerRecapQuery;
}

type DetailRangePreset = "inherited" | "7d" | "14d" | "30d";

const DETAIL_RANGE_OPTIONS: Array<{
  value: Exclude<DetailRangePreset, "inherited">;
  label: string;
  days: number;
}> = [
  { value: "7d", label: "7 Hari", days: 7 },
  { value: "14d", label: "14 Hari", days: 14 },
  { value: "30d", label: "30 Hari", days: 30 },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function jakartaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(dateKeyValue: string, days: number): string {
  const date = new Date(`${dateKeyValue}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return jakartaDateKey(date);
}

function buildDetailRange(preset: DetailRangePreset, fallback: CustomerRecapQuery): CustomerRecapQuery {
  const option = DETAIL_RANGE_OPTIONS.find((item) => item.value === preset);
  if (!option) return fallback;
  const dateTo = jakartaDateKey(new Date());
  return {
    dateFrom: addDays(dateTo, -(option.days - 1)),
    dateTo,
  };
}

export function CustomerRecapPanel({ customerId, range }: CustomerRecapPanelProps) {
  const [detailRangePreset, setDetailRangePreset] =
    useState<DetailRangePreset>("30d");
  const detailRange = useMemo(
    () => buildDetailRange(detailRangePreset, range),
    [detailRangePreset, range],
  );
  const { data } = useCustomerDetailRecap(customerId, detailRange);
  const handleRangeChange = useCallback((next: DetailRangePreset) => {
    setDetailRangePreset(next);
  }, []);

  return (
    <div className="mt-5 space-y-4 sm:mt-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
          Rentang Detail
        </p>
        <div className="grid w-full grid-cols-3 gap-1 rounded-full bg-slate-100 p-1 sm:w-auto">
          {DETAIL_RANGE_OPTIONS.map((option) => {
            const active = detailRangePreset === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleRangeChange(option.value)}
                className={`min-w-0 rounded-full px-3 py-2 text-xs font-black transition ${
                  active
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-600 hover:bg-white/70"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <Suspense
        fallback={
          <div className="h-64 rounded-2xl border border-slate-200 bg-slate-50" />
        }
      >
        <RecapTrendChart trend={data.trend} mode="detail" />
      </Suspense>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <PackageOpen className="h-4 w-4 text-slate-500" />
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
            Produk Teratas
          </p>
        </div>
        <div className="mt-3 divide-y divide-slate-100">
          {data.topProducts.length > 0 ? (
            data.topProducts.map((product) => (
              <div
                key={product.productId || product.productName}
                className="flex min-w-0 items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">
                    {product.productName}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {product.quantity} item
                  </p>
                </div>
                <p className="shrink-0 text-sm font-black text-slate-900">
                  {formatCurrency(product.subtotal)}
                </p>
              </div>
            ))
          ) : (
            <p className="py-6 text-sm text-slate-500">
              Belum ada produk pada periode ini.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default CustomerRecapPanel;

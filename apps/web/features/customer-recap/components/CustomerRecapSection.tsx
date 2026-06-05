"use client";

import React, { lazy, Suspense, useCallback, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useCustomerRecap } from "../hooks/useCustomerRecap";
import type { CustomerRecapQuery } from "../types/customer-recap";
import { RecapPeriodPicker } from "./RecapPeriodPicker";
import { RecapSummaryCards } from "./RecapSummaryCards";
import { RecapTopSpenders } from "./RecapTopSpenders";

const RecapByTypeChart = lazy(() => import("./RecapByTypeChart"));
const RecapTrendChart = lazy(() => import("./RecapTrendChart"));

interface CustomerRecapSectionProps {
  range: CustomerRecapQuery;
  onRangeChange: (next: CustomerRecapQuery) => void;
  onSelectCustomer: (customerId: string) => void;
}

function ChartFallback() {
  return (
    <div className="h-64 rounded-2xl border border-slate-200 bg-slate-50" />
  );
}

export function CustomerRecapSection({
  range,
  onRangeChange,
  onSelectCustomer,
}: CustomerRecapSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const { data } = useCustomerRecap(range);
  const handleToggle = useCallback(() => {
    setExpanded((current) => !current);
  }, []);

  return (
    <section className="customer-recap-section min-w-0 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand-600">
            Rekap Pelanggan
          </p>
          <h2 className="mt-1 text-lg font-black text-slate-950">
            Ringkasan aktivitas dan piutang
          </h2>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <RecapPeriodPicker value={range} onChange={onRangeChange} />
          <button
            type="button"
            onClick={handleToggle}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? "Tutup" : "Buka"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="customer-recap-content mt-4 space-y-4">
          <RecapSummaryCards summary={data.summary} />
          <div className="grid min-w-0 gap-4 xl:grid-cols-[1fr_380px]">
            <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-1">
              <Suspense fallback={<ChartFallback />}>
                <RecapTrendChart trend={data.trend} mode="page" />
              </Suspense>
              <Suspense fallback={<ChartFallback />}>
                <RecapByTypeChart rows={data.byType} />
              </Suspense>
            </div>
            <RecapTopSpenders
              customers={data.topSpenders}
              onSelectCustomer={onSelectCustomer}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default CustomerRecapSection;

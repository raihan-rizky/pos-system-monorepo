"use client";

import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import type {
  ExpenseSummary,
  IncomeSummary,
} from "@/features/keuangan/hooks/useKeuangan";

const CashFlowChart = lazy(() =>
  import("./CashFlowChart").then((module) => ({
    default: module.CashFlowChart,
  })),
);

function CashFlowChartPlaceholder() {
  return (
    <div
      role="status"
      aria-label="Memuat grafik arus kas"
      className="h-full w-full rounded-xl bg-surface-100 animate-pulse"
    />
  );
}

export function DeferredCashFlowChart({
  incomeDaily,
  expenseDaily,
  loading,
}: {
  incomeDaily: IncomeSummary["daily"] | undefined;
  expenseDaily: ExpenseSummary["daily"] | undefined;
  loading: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!("IntersectionObserver" in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldRender(true);
        observer.disconnect();
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-48 sm:h-56 md:h-64">
      {shouldRender ? (
        <Suspense fallback={<CashFlowChartPlaceholder />}>
          <CashFlowChart
            incomeDaily={incomeDaily}
            expenseDaily={expenseDaily}
            loading={loading}
          />
        </Suspense>
      ) : (
        <CashFlowChartPlaceholder />
      )}
    </div>
  );
}


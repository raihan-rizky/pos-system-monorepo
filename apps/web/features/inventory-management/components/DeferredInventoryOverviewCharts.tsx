"use client";

import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { InventorySummary } from "../types/inventory-management";

const InventoryOverviewCharts = lazy(() =>
  import("./InventoryOverviewCharts").then((module) => ({
    default: module.InventoryOverviewCharts,
  })),
);

function InventoryChartsPlaceholder() {
  return (
    <>
      <div className="h-[342px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
        <h2 className="text-base font-bold text-slate-900">
          Volume Inbound vs Outbound (7 Hari)
        </h2>
        <div className="mt-4 h-64 rounded-xl bg-slate-100 animate-pulse" />
      </div>
      <div className="h-[342px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">
          Kesehatan Gudang
        </h2>
        <div className="mt-5 h-56 rounded-xl bg-slate-100 animate-pulse" />
      </div>
    </>
  );
}

export function DeferredInventoryOverviewCharts({
  summary,
}: {
  summary: InventorySummary;
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
    <div
      ref={containerRef}
      className="grid grid-cols-1 gap-5 md:col-span-3 md:grid-cols-3"
    >
      {shouldRender ? (
        <Suspense fallback={<InventoryChartsPlaceholder />}>
          <InventoryOverviewCharts summary={summary} />
        </Suspense>
      ) : (
        <InventoryChartsPlaceholder />
      )}
    </div>
  );
}
